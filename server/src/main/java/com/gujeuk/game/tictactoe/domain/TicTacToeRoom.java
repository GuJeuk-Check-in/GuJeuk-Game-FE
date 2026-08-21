package com.gujeuk.game.tictactoe.domain;

import com.gujeuk.game.global.error.GameException;
import com.gujeuk.game.member.domain.EndReason;
import lombok.Getter;
import org.springframework.web.socket.WebSocketSession;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Random;

/**
 * 틱택토 방 하나.
 *
 * ─── 알까기 방과 다른 점 ─────────────────────────────────────────────────
 * 알까기는 물리 계산이 무거워서 양쪽 클라가 각자 시뮬레이션하고 결과 해시를
 * 서버에 보고하는 락스텝 방식이다. 틱택토는 그럴 이유가 없다. 판이 9칸이라
 * 서버가 직접 굴려도 부담이 없고, 매 수마다 판 전체를 내려보내면 디싱크가
 * 생길 여지 자체가 없다. 그래서 여기서는 서버가 유일한 진실이다.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * 상태는 메모리에만 있다. 서버가 내려가면 진행 중인 판은 사라지는데, 한 판이
 * 짧아서 DB에 넣어 얻는 것보다 잃는 게 크다. 끝난 판만 저장한다.
 *
 * 메서드는 소켓 스레드 여러 개에서 불린다. 상태를 건드리는 곳은 전부
 * synchronized로 묶는다 — 두 사람이 같은 순간에 같은 칸을 누르는 일이 실제로 있다.
 */
public class TicTacToeRoom {
    /** 접속이 끊긴 뒤 돌아올 때까지 기다리는 시간. 넘기면 몰수패. */
    private static final int RECONNECT_GRACE_SEC = 30;

    @Getter
    private final String code;
    private final TicTacToeRoomListener listener;
    private final Random random;
    private final TicTacToeGame game = new TicTacToeGame();

    @Getter
    private TicTacToeSeat host;
    @Getter
    private TicTacToeSeat guest;

    @Getter
    private TicTacToeRoomState state = TicTacToeRoomState.WAITING;

    /** 끊긴 사람을 기다리는 타이머. 돌아오면 취소한다. */
    private final Map<Long, TicTacToeRoomListener.Cancellable> pendingForfeits = new HashMap<>();

    public TicTacToeRoom(String code, TicTacToeRoomListener listener, Random random) {
        this.code = code;
        this.listener = listener;
        this.random = random;
    }

    // ---- 입장 -------------------------------------------------------------

    public synchronized void open(Long memberId, String nickname, int rating, WebSocketSession session) {
        // 선공이 유리하므로 방장이 항상 X를 갖지 않도록 섞는다.
        Mark hostMark = random.nextBoolean() ? Mark.X : Mark.O;
        host = new TicTacToeSeat(memberId, nickname, rating, hostMark, session);

        listener.send(host, Map.of(
                "type", "ROOM_CREATED",
                "code", code,
                "you", hostMark.lower()));
    }

    public synchronized void join(Long memberId, String nickname, int rating, WebSocketSession session) {
        if (host != null && host.getMemberId().equals(memberId)) {
            throw GameException.badRequest("자기가 만든 방에는 들어갈 수 없습니다.");
        }
        if (state != TicTacToeRoomState.WAITING || guest != null) {
            throw GameException.conflict("이미 시작했거나 자리가 없는 방입니다.");
        }

        guest = new TicTacToeSeat(memberId, nickname, rating, host.getMark().opponent(), session);

        listener.send(guest, Map.of(
                "type", "ROOM_JOINED",
                "code", code,
                "you", guest.getMark().lower(),
                "opponent", profile(host)));
        listener.send(host, Map.of(
                "type", "OPPONENT_JOINED",
                "opponent", profile(guest)));

        start();
    }

    private void start() {
        state = TicTacToeRoomState.PLAYING;
        listener.broadcast(this, Map.of(
                "type", "GAME_START",
                "board", game.boardView(),
                "turn", game.getTurn().lower()));
    }

    // ---- 대국 -------------------------------------------------------------

    /**
     * 한 수를 둔다.
     *
     * 클라이언트가 보내는 것은 "몇 번 칸"뿐이다. 차례인지, 빈 칸인지, 어떤 말이
     * 사라지는지는 전부 여기서 정한다. 클라가 계산한 결과를 받지 않는 이유는
     * 고친 클라로 아무 칸에나 둘 수 있기 때문이다.
     */
    public synchronized void move(TicTacToeSeat seat, int index) {
        if (state != TicTacToeRoomState.PLAYING) {
            throw GameException.badRequest("아직 시작하지 않았거나 이미 끝난 판입니다.");
        }

        int vanished;
        try {
            vanished = game.place(seat.getMark(), index);
        } catch (IllegalStateException invalid) {
            throw GameException.badRequest(invalid.getMessage());
        }

        Map<String, Object> message = new LinkedHashMap<>();
        message.put("type", "MOVE");
        message.put("by", seat.getMark().lower());
        message.put("index", index);
        message.put("vanished", vanished);
        message.put("board", game.boardView());
        message.put("turn", game.getTurn().lower());
        listener.broadcast(this, message);

        if (game.isOver()) {
            finish(seatOfMark(game.getWinner()), EndReason.LINE);
        }
    }

    public synchronized void resign(TicTacToeSeat seat) {
        if (state != TicTacToeRoomState.PLAYING) return;

        game.concede(seat.getMark());
        finish(opponentOf(seat), EndReason.RESIGN);
    }

    // ---- 접속 끊김 --------------------------------------------------------

    public synchronized void disconnect(TicTacToeSeat seat) {
        if (state == TicTacToeRoomState.FINISHED) {
            // 이미 끝난 방이면 둘 다 나가는 순간 정리한다.
            if (!bothConnected()) listener.dispose(this);
            return;
        }

        if (state == TicTacToeRoomState.WAITING) {
            // 상대가 오기 전에 방장이 나가면 방을 남길 이유가 없다.
            listener.dispose(this);
            return;
        }

        TicTacToeSeat opponent = opponentOf(seat);
        listener.send(opponent, Map.of(
                "type", "OPPONENT_LEFT",
                "graceSec", RECONNECT_GRACE_SEC));

        pendingForfeits.put(seat.getMemberId(), listener.schedule(() -> forfeit(seat), RECONNECT_GRACE_SEC));
    }

    /** 같은 계정이 다시 접속했을 때 자리를 이어받는다. */
    public synchronized boolean reconnect(Long memberId, WebSocketSession session) {
        TicTacToeSeat seat = seatOf(memberId);
        if (seat == null || state == TicTacToeRoomState.FINISHED) return false;

        seat.setSession(session);

        TicTacToeRoomListener.Cancellable pending = pendingForfeits.remove(memberId);
        if (pending != null) pending.cancel();

        listener.send(seat, Map.of(
                "type", "RESUMED",
                "you", seat.getMark().lower(),
                "board", game.boardView(),
                "turn", game.getTurn().lower()));

        TicTacToeSeat opponent = opponentOf(seat);
        if (opponent != null) listener.send(opponent, Map.of("type", "OPPONENT_BACK"));

        return true;
    }

    private synchronized void forfeit(TicTacToeSeat seat) {
        if (state != TicTacToeRoomState.PLAYING) return;
        if (seat.isConnected()) return;

        game.concede(seat.getMark());
        finish(opponentOf(seat), EndReason.DISCONNECT);
    }

    // ---- 종료 -------------------------------------------------------------

    private void finish(TicTacToeSeat winner, EndReason reason) {
        state = TicTacToeRoomState.FINISHED;
        pendingForfeits.values().forEach(TicTacToeRoomListener.Cancellable::cancel);
        pendingForfeits.clear();

        TicTacToeSeat loser = opponentOf(winner);
        var change = listener.finish(winner.getMemberId(), loser.getMemberId(), reason);

        // 레이팅 변동은 사람마다 부호가 반대라 각자에게 따로 보낸다.
        listener.send(winner, gameOver(true, reason, change.delta(), change.winnerRating()));
        listener.send(loser, gameOver(false, reason, -change.delta(), change.loserRating()));

        listener.dispose(this);
    }

    private Map<String, Object> gameOver(boolean won, EndReason reason, int delta, int rating) {
        Map<String, Object> message = new LinkedHashMap<>();
        message.put("type", "GAME_OVER");
        message.put("won", won);
        message.put("winner", game.getWinner() == null ? null : game.getWinner().lower());
        message.put("line", game.getWinningLine());
        message.put("reason", reason.name());
        message.put("ratingDelta", delta);
        message.put("rating", rating);
        return message;
    }

    // ---- 조회 -------------------------------------------------------------

    public synchronized TicTacToeSeat seatOf(Long memberId) {
        if (host != null && host.getMemberId().equals(memberId)) return host;
        if (guest != null && guest.getMemberId().equals(memberId)) return guest;
        return null;
    }

    private TicTacToeSeat seatOfMark(Mark mark) {
        if (host != null && host.getMark() == mark) return host;
        return guest;
    }

    private TicTacToeSeat opponentOf(TicTacToeSeat seat) {
        return seat == host ? guest : host;
    }

    private boolean bothConnected() {
        return host != null && host.isConnected() && guest != null && guest.isConnected();
    }

    private Map<String, Object> profile(TicTacToeSeat seat) {
        return Map.of("nickname", seat.getNickname(), "rating", seat.getRating());
    }
}
