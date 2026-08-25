package com.gujeuk.game.archery.domain;

import com.gujeuk.game.global.error.GameException;
import com.gujeuk.game.member.domain.EndReason;
import lombok.Getter;
import org.springframework.web.socket.WebSocketSession;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Random;

/**
 * 양궁 방 하나.
 *
 * ─── 다른 게임과 다른 점 ─────────────────────────────────────────────────
 * 화살은 서로 부딪히지 않는다. 한 발의 결과는 점수 하나로 끝나고, 같은
 * 입력(각도·세기·바람)이면 어느 화면에서든 같은 궤적이 나온다. 그래서 서버는
 * 궤적을 계산하지 않고 **차례와 바람만 관리**한다. 발사 입력을 상대에게
 * 그대로 중계하면 상대 화면에서 같은 화살이 난다.
 *
 * 점수는 쏜 쪽이 계산해 보고한다. 값의 범위만 확인하고 그대로 받는다 —
 * 서버가 물리를 다시 돌려 대조하려면 matter.js를 Java로 옮겨야 하는데,
 * 지금 단계에서는 그 비용이 이득보다 크다고 판단했다. 대신 각도·세기·바람을
 * 함께 받아두므로, 나중에 검증을 붙일 때 프로토콜을 바꾸지 않아도 된다.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * 메서드는 소켓 스레드 여러 개에서 불린다. 상태를 건드리는 곳은 전부
 * synchronized로 묶는다.
 */
public class ArcheryRoom {
    /** 한 사람이 쏘는 발수. */
    public static final int ARROWS_PER_ROUND = 5;
    /** 접속이 끊긴 뒤 돌아올 때까지 기다리는 시간. 넘기면 몰수패. */
    private static final int RECONNECT_GRACE_SEC = 30;
    private static final int MAX_SCORE_PER_ARROW = 10;
    /**
     * 한 차례에 주는 시간. 넘기면 0점으로 처리하고 차례를 넘긴다.
     *
     * 몰수하지 않는 이유는, 잠깐 자리를 비운 것과 나간 것을 여기서 가를 수
     * 없기 때문이다. 0점을 쌓으면 정말 없는 사람은 발수를 다 쓰고 점수로
     * 지고, 돌아온 사람은 남은 발로 이어갈 수 있다.
     */
    private static final int TURN_LIMIT_SEC = 45;

    @Getter
    private final String code;
    private final ArcheryRoomListener listener;
    private final Random random;

    @Getter
    private ArcherySeat host;
    @Getter
    private ArcherySeat guest;

    @Getter
    private ArcheryRoomState state = ArcheryRoomState.WAITING;

    /** 1부터. ARROWS_PER_ROUND를 넘어가면 서든데스다. */
    private int round = 1;
    /** 이번 라운드의 바람. 라운드가 같으면 양쪽이 같은 값을 받는다. */
    private double wind;
    /** 지금 쏠 사람. */
    private ArcherySeat turn;

    private final Map<Long, ArcheryRoomListener.Cancellable> pendingForfeits = new HashMap<>();
    private ArcheryRoomListener.Cancellable pendingDispose;
    private ArcheryRoomListener.Cancellable pendingTurnTimeout;

    public ArcheryRoom(String code, ArcheryRoomListener listener, Random random) {
        this.code = code;
        this.listener = listener;
        this.random = random;
    }

    // ---- 입장 -------------------------------------------------------------

    public synchronized void open(Long memberId, String nickname, int rating, WebSocketSession session) {
        // 먼저 쏘는 쪽이 유리하지도 불리하지도 않지만, 늘 방장이 먼저면
        // 방을 만든 사람만 같은 경험을 반복하게 된다.
        host = new ArcherySeat(memberId, nickname, rating, random.nextBoolean(), session);

        listener.send(host, Map.of("type", "ROOM_CREATED", "code", code));
    }

    public synchronized void join(Long memberId, String nickname, int rating, WebSocketSession session) {
        if (host != null && host.getMemberId().equals(memberId)) {
            throw GameException.badRequest("자기가 만든 방에는 들어갈 수 없습니다.");
        }
        if (state != ArcheryRoomState.WAITING || guest != null) {
            throw GameException.conflict("이미 시작했거나 자리가 없는 방입니다.");
        }
        // 방장이 끊긴 채 유예 시간을 보내는 중일 수 있다. 그대로 시작하면 몰수
        // 타이머는 대결 중에만 걸리므로 아무도 쏘지 못하는 방이 된다. 들어온
        // 쪽에는 OPPONENT_LEFT조차 가지 않아 영문도 모르고 기다리게 된다.
        if (host == null || !host.isConnected()) {
            throw GameException.conflict("방장이 자리를 비웠습니다. 잠시 후 다시 시도해주세요.");
        }

        cancelDispose();
        guest = new ArcherySeat(memberId, nickname, rating, !host.isFirst(), session);

        start();
    }

    private void start() {
        state = ArcheryRoomState.PLAYING;
        round = 1;
        wind = rollWind();
        turn = host.isFirst() ? host : guest;

        sendState(host, "GAME_START");
        sendState(guest, "GAME_START");
        armTurnTimer();
    }

    /** -1 ~ 1, 소수 한 자리. 라운드마다 새로 뽑는다. */
    private double rollWind() {
        return Math.round((random.nextDouble() * 2 - 1) * 10) / 10.0;
    }

    // ---- 사격 -------------------------------------------------------------

    /**
     * 한 발을 쏜다.
     *
     * @param angle 라디안. 화면 재생용으로 상대에게 그대로 전달한다.
     * @param power 0~1.
     * @param score 쏜 쪽이 계산한 점수. 범위만 확인한다.
     */
    public synchronized void shoot(ArcherySeat seat, double angle, double power, int score) {
        if (state != ArcheryRoomState.PLAYING) {
            throw GameException.badRequest("아직 시작하지 않았거나 이미 끝난 대결입니다.");
        }
        if (seat != turn) {
            throw GameException.badRequest("당신 차례가 아닙니다.");
        }
        if (score < 0 || score > MAX_SCORE_PER_ARROW) {
            throw GameException.badRequest("점수가 올바르지 않습니다.");
        }

        record(seat, angle, power, score, false);
    }

    /**
     * 차례가 시간을 넘겼다. 0점으로 적고 넘긴다.
     *
     * 지나간 타이머일 수 있으므로 지금도 그 사람 차례인지 다시 본다.
     */
    private synchronized void timeoutTurn(ArcherySeat seat) {
        if (state != ArcheryRoomState.PLAYING) return;
        if (seat != turn) return;

        record(seat, 0, 0, 0, true);
    }

    /** 한 발을 점수판에 적고 차례를 넘긴다. 쏜 것이든 시간을 넘긴 것이든 같다. */
    private void record(ArcherySeat seat, double angle, double power, int score, boolean timedOut) {
        seat.getShots().add(score);

        ArcherySeat other = opponentOf(seat);
        // 같은 라운드에서 둘 다 쐈으면 다음 라운드로 넘어간다.
        boolean roundDone = other.getShots().size() >= seat.getShots().size();

        Map<String, Object> shot = new LinkedHashMap<>();
        shot.put("angle", angle);
        shot.put("power", power);
        // 이 발이 실제로 맞은 바람. fillCommon이 넣는 wind(다음 발용)와 뜻이 달라
        // 키를 나눠야 한다. 한 키를 같이 쓰면 나중에 넣는 쪽이 덮어쓴다.
        shot.put("shotWind", wind);
        shot.put("score", score);
        // 시간을 넘겨 적힌 발은 날아간 화살이 없다. 상대 화면이 재생하면 안 된다.
        shot.put("timedOut", timedOut);

        if (roundDone) {
            round += 1;
            wind = rollWind();
            // 라운드마다 선후를 바꾼다. 마지막에 쏘는 쪽이 상대 점수를 보고
            // 쏘게 되는데, 그 이점이 한쪽에만 쌓이지 않게 한다.
            turn = seat;
        } else {
            turn = other;
        }

        sendShot(seat, shot, true);
        sendShot(other, shot, false);

        if (isDecided()) {
            finishByScore();
            return;
        }
        armTurnTimer();
    }

    private void armTurnTimer() {
        cancelTurnTimer();
        ArcherySeat current = turn;
        pendingTurnTimeout = listener.schedule(() -> timeoutTurn(current), TURN_LIMIT_SEC);
    }

    private void cancelTurnTimer() {
        if (pendingTurnTimeout == null) return;
        pendingTurnTimeout.cancel();
        pendingTurnTimeout = null;
    }

    /** 정해진 발수를 다 쐈고 총점이 갈렸는지. 동점이면 서든데스로 이어진다. */
    private boolean isDecided() {
        int done = Math.min(host.getShots().size(), guest.getShots().size());
        if (done < ARROWS_PER_ROUND) return false;
        // 양쪽이 같은 발수를 쏜 상태에서만 비교한다.
        if (host.getShots().size() != guest.getShots().size()) return false;

        return host.total() != guest.total();
    }

    private void finishByScore() {
        ArcherySeat winner = host.total() > guest.total() ? host : guest;
        finish(winner, EndReason.SCORE);
    }

    /**
     * 방을 떠난다.
     *
     * 이게 없어서 로비로 돌아가도 방이 서버에 남았고, 새로고침하면 재접속이
     * 그 방을 찾아 붙여 취소한 방으로 되돌아갔다.
     */
    public synchronized void leave(ArcherySeat seat) {
        if (state == ArcheryRoomState.FINISHED) return;

        if (state == ArcheryRoomState.WAITING) {
            // 아직 상대가 없다. 방을 접는다.
            cancelDispose();
            state = ArcheryRoomState.FINISHED;
            listener.dispose(this);
            return;
        }

        // 대결 중에 나가는 것은 기권과 같다.
        finish(opponentOf(seat), EndReason.RESIGN);
    }

    public synchronized void resign(ArcherySeat seat) {
        if (state != ArcheryRoomState.PLAYING) return;
        finish(opponentOf(seat), EndReason.RESIGN);
    }

    // ---- 접속 끊김 --------------------------------------------------------

    public synchronized void disconnect(ArcherySeat seat) {
        seat.setAway(true);

        if (state == ArcheryRoomState.FINISHED) {
            if (!bothConnected()) listener.dispose(this);
            return;
        }

        if (state == ArcheryRoomState.WAITING) {
            // 바로 폐기하면 방장이 새로고침만 해도 방이 사라져, 코드를 알려준
            // 상대가 못 들어온다. 대결 중과 같은 유예를 준다.
            pendingDispose = listener.schedule(this::disposeIfAbandoned, RECONNECT_GRACE_SEC);
            return;
        }

        listener.send(opponentOf(seat), Map.of("type", "OPPONENT_LEFT", "graceSec", RECONNECT_GRACE_SEC));
        pendingForfeits.put(seat.getMemberId(), listener.schedule(() -> forfeit(seat), RECONNECT_GRACE_SEC));
    }

    /** 같은 계정이 다시 접속했을 때 자리를 이어받는다. */
    public synchronized boolean reconnect(Long memberId, WebSocketSession session) {
        ArcherySeat seat = seatOf(memberId);
        if (seat == null || state == ArcheryRoomState.FINISHED) return false;

        seat.setSession(session);
        seat.setAway(false);

        ArcheryRoomListener.Cancellable pending = pendingForfeits.remove(memberId);
        if (pending != null) pending.cancel();
        cancelDispose();

        if (state == ArcheryRoomState.WAITING) {
            listener.send(seat, Map.of("type", "ROOM_CREATED", "code", code));
            return true;
        }

        sendState(seat, "RESUMED");
        listener.send(opponentOf(seat), Map.of("type", "OPPONENT_BACK"));
        return true;
    }

    private synchronized void forfeit(ArcherySeat seat) {
        if (state != ArcheryRoomState.PLAYING) return;
        if (seat.isConnected()) return;

        finish(opponentOf(seat), EndReason.DISCONNECT);
    }

    private synchronized void disposeIfAbandoned() {
        pendingDispose = null;
        if (state != ArcheryRoomState.WAITING) return;
        if (host != null && host.isConnected()) return;

        listener.dispose(this);
    }

    private void cancelDispose() {
        if (pendingDispose == null) return;
        pendingDispose.cancel();
        pendingDispose = null;
    }

    // ---- 종료 -------------------------------------------------------------

    private void finish(ArcherySeat winner, EndReason reason) {
        state = ArcheryRoomState.FINISHED;
        pendingForfeits.values().forEach(ArcheryRoomListener.Cancellable::cancel);
        pendingForfeits.clear();
        cancelDispose();
        cancelTurnTimer();

        ArcherySeat loser = opponentOf(winner);
        var change = listener.finish(winner.getMemberId(), loser.getMemberId(), reason);

        listener.send(winner, gameOver(winner, true, reason, change.delta(), change.winnerRating()));
        listener.send(loser, gameOver(loser, false, reason, -change.delta(), change.loserRating()));

        listener.dispose(this);
    }

    private Map<String, Object> gameOver(ArcherySeat seat, boolean won, EndReason reason, int delta, int rating) {
        Map<String, Object> message = new LinkedHashMap<>();
        message.put("type", "GAME_OVER");
        message.put("won", won);
        message.put("reason", reason.name());
        message.put("myTotal", seat.total());
        message.put("theirTotal", opponentOf(seat).total());
        message.put("ratingDelta", delta);
        message.put("rating", rating);
        return message;
    }

    // ---- 전송 -------------------------------------------------------------

    /**
     * 자리마다 자기 시점으로 상태를 보낸다.
     *
     * 흑·백 같은 진영 이름을 두지 않는 이유는, 그러면 클라가 "내가 어느
     * 쪽인지"를 계속 따져야 하기 때문이다. 각자에게 "네 차례인지, 네 점수는
     * 얼마인지"로 보내면 화면은 그대로 그리기만 하면 된다.
     */
    private void sendState(ArcherySeat seat, String type) {
        if (seat == null) return;

        Map<String, Object> message = new LinkedHashMap<>();
        message.put("type", type);
        message.put("opponent", profile(opponentOf(seat)));
        fillCommon(seat, message);
        listener.send(seat, message);
    }

    private void sendShot(ArcherySeat seat, Map<String, Object> shot, boolean mine) {
        if (seat == null) return;

        Map<String, Object> message = new LinkedHashMap<>();
        message.put("type", "SHOT");
        message.put("mine", mine);
        message.putAll(shot);
        fillCommon(seat, message);
        listener.send(seat, message);
    }

    private void fillCommon(ArcherySeat seat, Map<String, Object> message) {
        ArcherySeat other = opponentOf(seat);
        message.put("yourTurn", turn == seat);
        message.put("wind", wind);
        message.put("round", round);
        message.put("arrowsPerRound", ARROWS_PER_ROUND);
        message.put("turnLimitSec", TURN_LIMIT_SEC);
        message.put("myShots", seat.getShots());
        message.put("theirShots", other == null ? java.util.List.of() : other.getShots());
        message.put("myTotal", seat.total());
        message.put("theirTotal", other == null ? 0 : other.total());
        message.put("suddenDeath", inSuddenDeath());
    }

    /**
     * 정말로 서든데스에 들어갔는지.
     *
     * 라운드 번호만 보면 안 된다. 마지막 발을 쏘는 순간 라운드가 먼저 올라가서,
     * 총점이 갈려 정상 종료되는 판에서도 "서든데스"가 한 번 깜빡인다.
     * 발수를 다 채웠고 총점까지 같을 때만 참이다.
     */
    private boolean inSuddenDeath() {
        if (guest == null) return false;

        return host.getShots().size() >= ARROWS_PER_ROUND
                && guest.getShots().size() >= ARROWS_PER_ROUND
                && host.total() == guest.total();
    }

    // ---- 조회 -------------------------------------------------------------

    public synchronized ArcherySeat seatOf(Long memberId) {
        if (host != null && host.getMemberId().equals(memberId)) return host;
        if (guest != null && guest.getMemberId().equals(memberId)) return guest;
        return null;
    }

    private ArcherySeat opponentOf(ArcherySeat seat) {
        return seat == host ? guest : host;
    }

    private boolean bothConnected() {
        return host != null && host.isConnected() && guest != null && guest.isConnected();
    }

    private Map<String, Object> profile(ArcherySeat seat) {
        if (seat == null) return Map.of();
        return Map.of("nickname", seat.getNickname(), "rating", seat.getRating());
    }
}
