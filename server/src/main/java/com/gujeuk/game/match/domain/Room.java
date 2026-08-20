package com.gujeuk.game.match.domain;

import com.gujeuk.game.global.error.GameException;
import com.gujeuk.game.member.domain.EndReason;
import lombok.Getter;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

/**
 * 한 판이 벌어지는 방.
 *
 * 물리는 서버가 돌리지 않는다. 서버는 "누가 어느 돌을 어디로 튕겼는지"만 중계하고,
 * 양쪽 클라가 각자 같은 입력으로 시뮬레이션한 뒤 최종 상태 해시를 보고한다.
 * 두 보고가 다르면 디싱크로 보고 판을 무효로 만든다 — 한쪽만 클라를 고쳐도
 * 해시가 어긋나므로 혼자서는 승부를 조작할 수 없다.
 *
 * 모든 진입점은 synchronized다. 두 소켓 스레드가 동시에 들어오는 게 정상 상황이라
 * 상태 전이를 원자적으로 두지 않으면 턴이 두 번 넘어가는 등으로 깨진다.
 */
@Getter
public class Room {
    /** 배치 제한. 넘기면 기본 배치로 자동 진행한다. */
    public static final int PLACEMENT_LIMIT_SEC = 60;
    /** 턴 제한. 넘기면 턴을 넘긴다. */
    public static final int TURN_LIMIT_SEC = 30;
    /** 재접속 유예. 넘기면 몰수패. */
    public static final int RECONNECT_GRACE_SEC = 60;
    /** 연속으로 이만큼 턴을 흘려보내면 몰수패. 무한 방치를 끝내기 위한 값. */
    private static final int MAX_CONSECUTIVE_TIMEOUTS = 3;

    private final String code;
    private final RoomListener listener;
    private final Random random;

    private RoomState state = RoomState.WAITING;
    private Seat host;
    private Seat guest;
    private Player turn;

    private RoomListener.Cancellable placementTimer;
    private RoomListener.Cancellable turnTimer;
    private final Map<Player, RoomListener.Cancellable> reconnectTimers = new HashMap<>();

    public Room(String code, RoomListener listener, Random random) {
        this.code = code;
        this.listener = listener;
        this.random = random;
    }

    // ---- 입장 -------------------------------------------------------------

    public synchronized Seat open(Long memberId, String nickname, int rating,
                                  org.springframework.web.socket.WebSocketSession session) {
        host = new Seat(memberId, nickname, rating, Player.BLACK, session);
        listener.send(host, message("ROOM_CREATED", Map.of("code", code, "you", host.getColor().lower())));
        return host;
    }

    public synchronized Seat join(Long memberId, String nickname, int rating,
                                  org.springframework.web.socket.WebSocketSession session) {
        Seat existing = seatOf(memberId);
        if (existing != null) {
            return reconnect(existing, session);
        }

        if (state != RoomState.WAITING || guest != null) {
            throw GameException.conflict("이미 진행 중인 방입니다.");
        }
        if (host != null && host.getMemberId().equals(memberId)) {
            throw GameException.badRequest("자기 방에는 들어갈 수 없습니다.");
        }

        guest = new Seat(memberId, nickname, rating, Player.WHITE, session);

        listener.send(guest, message("ROOM_JOINED", Map.of(
                "code", code,
                "you", guest.getColor().lower(),
                "opponent", profile(host))));
        listener.send(host, message("OPPONENT_JOINED", Map.of("opponent", profile(guest))));

        startPlacement();
        return guest;
    }

    private Seat reconnect(Seat seat, org.springframework.web.socket.WebSocketSession session) {
        seat.setSession(session);

        RoomListener.Cancellable timer = reconnectTimers.remove(seat.getColor());
        if (timer != null) timer.cancel();

        listener.send(seat, message("RECONNECTED", Map.of(
                "code", code,
                "you", seat.getColor().lower(),
                "state", state.name(),
                "turn", turn == null ? "" : turn.lower(),
                "opponent", profile(other(seat)))));

        Seat opponent = other(seat);
        if (opponent != null) {
            listener.send(opponent, message("OPPONENT_RECONNECTED", Map.of()));
        }

        return seat;
    }

    // ---- 배치 -------------------------------------------------------------

    private void startPlacement() {
        state = RoomState.PLACING;

        broadcast("PLACEMENT_START", Map.of(
                "limitSec", PLACEMENT_LIMIT_SEC,
                "stoneCount", Placement.STONE_COUNT,
                "board", Placement.BOARD,
                "stoneRadius", Placement.STONE_RADIUS));

        placementTimer = listener.schedule(this::onPlacementTimeout, PLACEMENT_LIMIT_SEC);
    }

    public synchronized void place(Seat seat, List<Stone> stones) {
        if (state != RoomState.PLACING) {
            throw GameException.badRequest("지금은 배치할 수 없습니다.");
        }
        if (seat.getPlacement() != null) {
            throw GameException.badRequest("이미 배치를 마쳤습니다.");
        }

        Placement.validate(seat.getColor(), stones);
        seat.setPlacement(stones);

        Seat opponent = other(seat);
        if (opponent != null) listener.send(opponent, message("OPPONENT_PLACED", Map.of()));

        if (bothPlaced()) startGame();
    }

    private synchronized void onPlacementTimeout() {
        if (state != RoomState.PLACING) return;

        // 시간을 넘긴 쪽만 기본 배치로 채운다. 이미 놓은 쪽 배치는 존중한다.
        for (Seat seat : seats()) {
            if (seat.getPlacement() == null) {
                seat.setPlacement(Placement.defaultFor(seat.getColor()));
                listener.send(seat, message("PLACEMENT_AUTO", Map.of()));
            }
        }

        startGame();
    }

    private void startGame() {
        if (placementTimer != null) {
            placementTimer.cancel();
            placementTimer = null;
        }

        state = RoomState.PLAYING;
        turn = random.nextBoolean() ? Player.BLACK : Player.WHITE;

        broadcast("GAME_START", Map.of(
                "first", turn.lower(),
                "stones", stonePayload()));

        startTurnTimer();
    }

    /** 돌 id는 흑 0~4, 백 5~9로 고정한다. 양쪽 클라가 같은 id를 봐야 중계가 성립한다. */
    private List<Map<String, Object>> stonePayload() {
        List<Map<String, Object>> payload = new ArrayList<>();
        int id = 0;

        for (Player player : List.of(Player.BLACK, Player.WHITE)) {
            for (Stone stone : seatOf(player).getPlacement()) {
                payload.add(new LinkedHashMap<>(Map.of(
                        "id", id++,
                        "owner", player.lower(),
                        "x", stone.x(),
                        "y", stone.y())));
            }
        }

        return payload;
    }

    // ---- 대국 -------------------------------------------------------------

    public synchronized void flick(Seat seat, int stoneId, double vx, double vy) {
        if (state != RoomState.PLAYING) throw GameException.badRequest("대국 중이 아닙니다.");
        if (seat.getColor() != turn) throw GameException.badRequest("자기 차례가 아닙니다.");
        if (!ownsStone(seat.getColor(), stoneId)) throw GameException.badRequest("자기 돌만 칠 수 있습니다.");

        seat.setConsecutiveTimeouts(0);
        cancelTurnTimer();

        // 친 사람에게도 그대로 돌려준다. 양쪽이 완전히 같은 값으로 시뮬레이션해야
        // 해시가 맞는다 — 보낸 쪽이 자기 로컬 값을 쓰면 미세하게 갈라질 수 있다.
        broadcast("FLICK", Map.of("stoneId", stoneId, "vx", vx, "vy", vy));
    }

    private boolean ownsStone(Player player, int stoneId) {
        int base = player == Player.BLACK ? 0 : Placement.STONE_COUNT;
        return stoneId >= base && stoneId < base + Placement.STONE_COUNT;
    }

    public synchronized void turnEnd(Seat seat, String hash, int black, int white) {
        if (state != RoomState.PLAYING) return;

        seat.setReport(new Seat.TurnReport(hash, black, white));

        Seat opponent = other(seat);
        if (opponent == null || opponent.getReport() == null) return;

        Seat.TurnReport mine = seat.getReport();
        Seat.TurnReport theirs = opponent.getReport();

        seat.setReport(null);
        opponent.setReport(null);

        if (!mine.hash().equals(theirs.hash())) {
            // 한쪽이 조작됐거나 시뮬레이션이 갈라졌다. 어느 쪽이 옳은지 서버는
            // 알 수 없으므로 승패를 내지 않고 무효 처리한다.
            state = RoomState.FINISHED;
            broadcast("DESYNC", Map.of("message", "두 화면의 결과가 달라 이 판을 무효로 합니다."));
            listener.dispose(this);
            return;
        }

        if (mine.black() == 0 || mine.white() == 0) {
            Player winner = mine.black() == 0 ? Player.WHITE : Player.BLACK;
            finish(winner, EndReason.KNOCKOUT);
            return;
        }

        turn = turn.opponent();
        broadcast("TURN", Map.of("turn", turn.lower()));
        startTurnTimer();
    }

    // ---- 종료 -------------------------------------------------------------

    public synchronized void resign(Seat seat) {
        if (state != RoomState.PLAYING && state != RoomState.PLACING) return;
        finish(seat.getColor().opponent(), EndReason.RESIGN);
    }

    public synchronized void disconnect(Seat seat) {
        if (state == RoomState.FINISHED) return;

        if (state == RoomState.WAITING) {
            // 아직 아무도 안 들어왔다. 방만 정리하면 된다.
            listener.dispose(this);
            return;
        }

        Seat opponent = other(seat);
        if (opponent != null) {
            listener.send(opponent, message("OPPONENT_DISCONNECTED",
                    Map.of("graceSec", RECONNECT_GRACE_SEC)));
        }

        reconnectTimers.put(seat.getColor(), listener.schedule(
                () -> onReconnectTimeout(seat.getColor()), RECONNECT_GRACE_SEC));
    }

    private synchronized void onReconnectTimeout(Player color) {
        reconnectTimers.remove(color);

        Seat seat = seatOf(color);
        if (seat == null || seat.isConnected() || state == RoomState.FINISHED) return;

        finish(color.opponent(), EndReason.DISCONNECT);
    }

    private void startTurnTimer() {
        cancelTurnTimer();
        turnTimer = listener.schedule(this::onTurnTimeout, TURN_LIMIT_SEC);
    }

    private void cancelTurnTimer() {
        if (turnTimer != null) {
            turnTimer.cancel();
            turnTimer = null;
        }
    }

    private synchronized void onTurnTimeout() {
        if (state != RoomState.PLAYING) return;

        Seat seat = seatOf(turn);
        seat.setConsecutiveTimeouts(seat.getConsecutiveTimeouts() + 1);

        if (seat.getConsecutiveTimeouts() >= MAX_CONSECUTIVE_TIMEOUTS) {
            finish(turn.opponent(), EndReason.DISCONNECT);
            return;
        }

        turn = turn.opponent();
        broadcast("TURN", Map.of("turn", turn.lower(), "timedOut", true));
        startTurnTimer();
    }

    private void finish(Player winner, EndReason reason) {
        state = RoomState.FINISHED;
        cancelTurnTimer();
        if (placementTimer != null) placementTimer.cancel();
        reconnectTimers.values().forEach(RoomListener.Cancellable::cancel);
        reconnectTimers.clear();

        Seat winnerSeat = seatOf(winner);
        Seat loserSeat = seatOf(winner.opponent());

        if (winnerSeat == null || loserSeat == null) {
            listener.dispose(this);
            return;
        }

        RoomListener.RatingChange change =
                listener.finish(winnerSeat.getMemberId(), loserSeat.getMemberId(), reason);

        listener.send(winnerSeat, message("GAME_OVER", Map.of(
                "winner", winner.lower(),
                "won", true,
                "ratingDelta", change.delta(),
                "rating", change.winnerRating(),
                "reason", reason.name())));

        listener.send(loserSeat, message("GAME_OVER", Map.of(
                "winner", winner.lower(),
                "won", false,
                "ratingDelta", -change.delta(),
                "rating", change.loserRating(),
                "reason", reason.name())));

        listener.dispose(this);
    }

    // ---- 도우미 -----------------------------------------------------------

    public synchronized Seat seatOf(Long memberId) {
        if (host != null && host.getMemberId().equals(memberId)) return host;
        if (guest != null && guest.getMemberId().equals(memberId)) return guest;
        return null;
    }

    private Seat seatOf(Player color) {
        if (host != null && host.getColor() == color) return host;
        if (guest != null && guest.getColor() == color) return guest;
        return null;
    }

    private Seat other(Seat seat) {
        return seat == host ? guest : host;
    }

    private List<Seat> seats() {
        List<Seat> list = new ArrayList<>();
        if (host != null) list.add(host);
        if (guest != null) list.add(guest);
        return list;
    }

    private boolean bothPlaced() {
        return host != null && guest != null
                && host.getPlacement() != null && guest.getPlacement() != null;
    }

    private Map<String, Object> profile(Seat seat) {
        if (seat == null) return Map.of();
        return Map.of("nickname", seat.getNickname(), "rating", seat.getRating());
    }

    private void broadcast(String type, Map<String, Object> payload) {
        listener.broadcast(this, message(type, payload));
    }

    private Map<String, Object> message(String type, Map<String, Object> payload) {
        Map<String, Object> message = new LinkedHashMap<>();
        message.put("type", type);
        message.putAll(payload);
        return message;
    }
}
