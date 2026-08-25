package com.gujeuk.game.archery;

import com.gujeuk.game.archery.domain.ArcheryRoom;
import com.gujeuk.game.archery.domain.ArcheryRoomListener;
import com.gujeuk.game.archery.domain.ArcheryRoomState;
import com.gujeuk.game.archery.domain.ArcherySeat;
import com.gujeuk.game.member.domain.EndReason;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 방의 상태 전이만 확인한다.
 *
 * 방은 소켓도 DB도 모르고 리스너 뒤로 밀어놨기 때문에, 가짜 리스너 하나면
 * 소켓 없이 대결 한 판을 끝까지 돌려볼 수 있다.
 */
class ArcheryRoomTest {

    private FakeListener listener;
    private ArcheryRoom room;

    /** 항상 host가 먼저 쏘도록 고정한다. 순서가 무작위면 테스트가 흔들린다. */
    private static Random fixedRandom(boolean hostFirst) {
        return new Random() {
            @Override
            public boolean nextBoolean() {
                return hostFirst;
            }

            @Override
            public double nextDouble() {
                return 0.5;
            }
        };
    }

    /**
     * nextDouble이 미리 정한 값을 차례로 돌려준다.
     *
     * 기존 fixedRandom은 nextDouble을 0.5로 고정해 바람이 항상 0이었다. 그래서
     * 바람이 섞여 나가는 버그를 테스트가 통째로 못 보고 지나쳤다.
     */
    private static Random windSequence(boolean hostFirst, double... values) {
        return new Random() {
            private int index = 0;

            @Override
            public boolean nextBoolean() {
                return hostFirst;
            }

            @Override
            public double nextDouble() {
                double value = values[Math.min(index, values.length - 1)];
                index += 1;
                return value;
            }
        };
    }

    @BeforeEach
    void setUp() {
        listener = new FakeListener();
        room = new ArcheryRoom("CODE01", listener, fixedRandom(true));
        room.open(1L, "host", 1200, null);
        room.join(2L, "guest", 1200, null);
    }

    private ArcherySeat host() {
        return room.getHost();
    }

    private ArcherySeat guest() {
        return room.getGuest();
    }

    /** 지금 차례인 쪽에게 한 발 쏘게 한다. */
    private void shootTurn(int score) {
        ArcherySeat seat = whoseTurn();
        room.shoot(seat, 0.7, 0.8, score);
    }

    /** 마지막으로 전달된 yourTurn 값으로 차례를 읽는다. */
    private ArcherySeat whoseTurn() {
        Boolean hostTurn = listener.lastTurnOf(host());
        return Boolean.TRUE.equals(hostTurn) ? host() : guest();
    }

    @Test
    void 시작하면_먼저_쏘는_쪽부터다() {
        assertThat(room.getState()).isEqualTo(ArcheryRoomState.PLAYING);
        assertThat(whoseTurn()).isSameAs(host());
    }

    @Test
    void 한_발_쏘면_상대_차례로_넘어간다() {
        room.shoot(host(), 0.7, 0.8, 9);

        assertThat(whoseTurn()).isSameAs(guest());
        assertThat(host().getShots()).containsExactly(9);
    }

    @Test
    void 라운드마다_선후가_바뀐다() {
        // 1라운드: host 먼저, guest 나중
        room.shoot(host(), 0.7, 0.8, 9);
        room.shoot(guest(), 0.7, 0.8, 9);

        // 2라운드는 방금 마지막에 쏜 guest가 먼저다.
        assertThat(whoseTurn()).isSameAs(guest());
    }

    @Test
    void 남의_차례에는_쏠_수_없다() {
        assertThatThrownBy(() -> room.shoot(guest(), 0.7, 0.8, 9))
                .hasMessageContaining("차례");
    }

    @Test
    void 점수_범위를_벗어나면_거부한다() {
        assertThatThrownBy(() -> room.shoot(host(), 0.7, 0.8, 11))
                .hasMessageContaining("점수");
        assertThatThrownBy(() -> room.shoot(host(), 0.7, 0.8, -1))
                .hasMessageContaining("점수");
    }

    @Test
    void 다섯_발을_다_쏘고_총점이_갈리면_끝난다() {
        // host 10점씩, guest 5점씩
        for (int i = 0; i < ArcheryRoom.ARROWS_PER_ROUND * 2; i += 1) {
            ArcherySeat seat = whoseTurn();
            shootTurn(seat == host() ? 10 : 5);
        }

        assertThat(room.getState()).isEqualTo(ArcheryRoomState.FINISHED);
        assertThat(listener.finishedWinner).isEqualTo(1L);
        assertThat(listener.finishedReason).isEqualTo(EndReason.SCORE);
    }

    @Test
    void 동점이면_끝나지_않고_서든데스로_이어진다() {
        for (int i = 0; i < ArcheryRoom.ARROWS_PER_ROUND * 2; i += 1) {
            shootTurn(7);
        }

        assertThat(room.getState()).isEqualTo(ArcheryRoomState.PLAYING);
        assertThat(listener.lastSuddenDeath).isTrue();
        assertThat(host().getShots()).hasSize(ArcheryRoom.ARROWS_PER_ROUND);
        assertThat(guest().getShots()).hasSize(ArcheryRoom.ARROWS_PER_ROUND);
    }

    @Test
    void 서든데스에서_갈리면_끝난다() {
        for (int i = 0; i < ArcheryRoom.ARROWS_PER_ROUND * 2; i += 1) {
            shootTurn(7);
        }

        // 서든데스 한 라운드: 먼저 쏘는 쪽이 10점, 나중이 3점
        shootTurn(10);
        shootTurn(3);

        assertThat(room.getState()).isEqualTo(ArcheryRoomState.FINISHED);
        assertThat(listener.finishedReason).isEqualTo(EndReason.SCORE);
    }

    @Test
    void 서든데스에서도_동점이면_계속된다() {
        for (int i = 0; i < ArcheryRoom.ARROWS_PER_ROUND * 2; i += 1) {
            shootTurn(7);
        }
        shootTurn(8);
        shootTurn(8);

        assertThat(room.getState()).isEqualTo(ArcheryRoomState.PLAYING);
    }

    @Test
    void 라운드를_닫는_발은_쏜_바람과_다음_바람을_따로_보낸다() {
        // nextDouble 1.0 → 바람 +1.0, 0.0 → 바람 -1.0
        FakeListener fake = new FakeListener();
        ArcheryRoom room = new ArcheryRoom("CODE02", fake, windSequence(true, 1.0, 0.0));
        room.open(1L, "host", 1200, null);
        room.join(2L, "guest", 1200, null);

        // 1라운드를 연다. 아직 바람이 바뀌지 않았으므로 두 값이 같아야 한다.
        room.shoot(room.getHost(), 0.7, 0.8, 9);
        Map<String, Object> opening = fake.lastShotOf(room.getGuest());
        assertThat(opening.get("shotWind")).isEqualTo(1.0);
        assertThat(opening.get("wind")).isEqualTo(1.0);

        // 라운드를 닫는 발. 서버가 다음 바람을 새로 뽑으므로 두 값이 갈린다.
        room.shoot(room.getGuest(), 0.7, 0.8, 9);
        Map<String, Object> closing = fake.lastShotOf(room.getHost());

        // 상대 화면이 이 화살을 재생할 때 쓰는 값
        assertThat(closing.get("shotWind")).isEqualTo(1.0);
        // 다음 발에 불 바람. 같은 키를 쓰면 위 값이 이걸로 덮여 궤적이 어긋난다.
        assertThat(closing.get("wind")).isEqualTo(-1.0);
    }

    @Test
    void 유예_안에_안_돌아오면_몰수패다() {
        room.disconnect(host());
        listener.runScheduled();

        assertThat(room.getState()).isEqualTo(ArcheryRoomState.FINISHED);
        assertThat(listener.finishedWinner).isEqualTo(2L);
        assertThat(listener.finishedReason).isEqualTo(EndReason.DISCONNECT);
    }

    @Test
    void 유예_안에_돌아오면_몰수가_취소된다() {
        room.disconnect(host());

        assertThat(room.reconnect(1L, null)).isTrue();
        listener.runScheduled();

        assertThat(room.getState()).isEqualTo(ArcheryRoomState.PLAYING);
    }

    @Test
    void 차례_시간을_넘기면_0점으로_적히고_넘어간다() {
        assertThat(whoseTurn()).isSameAs(host());

        listener.runScheduled();

        assertThat(host().getShots()).containsExactly(0);
        assertThat(whoseTurn()).isSameAs(guest());
        // 날아간 화살이 없으므로 상대 화면이 재생하면 안 된다.
        assertThat(listener.lastShotOf(guest()).get("timedOut")).isEqualTo(true);
    }

    @Test
    void 대결_중_방을_떠나면_상대가_이긴다() {
        room.leave(host());

        assertThat(room.getState()).isEqualTo(ArcheryRoomState.FINISHED);
        assertThat(listener.finishedWinner).isEqualTo(2L);
        assertThat(listener.finishedReason).isEqualTo(EndReason.RESIGN);
    }

    @Test
    void 대기_중_방을_떠나면_방이_닫힌다() {
        FakeListener fake = new FakeListener();
        ArcheryRoom waiting = new ArcheryRoom("CODE03", fake, fixedRandom(true));
        waiting.open(1L, "host", 1200, null);

        waiting.leave(waiting.getHost());

        assertThat(waiting.getState()).isEqualTo(ArcheryRoomState.FINISHED);
        assertThat(fake.disposed).isTrue();
    }

    @Test
    void 방장이_자리를_비운_방에는_들어갈_수_없다() {
        FakeListener fake = new FakeListener();
        ArcheryRoom waiting = new ArcheryRoom("CODE04", fake, fixedRandom(true));
        waiting.open(1L, "host", 1200, null);
        waiting.disconnect(waiting.getHost());

        assertThatThrownBy(() -> waiting.join(2L, "guest", 1200, null))
                .hasMessageContaining("자리를 비웠");

        assertThat(waiting.getState()).isEqualTo(ArcheryRoomState.WAITING);
    }

    @Test
    void 발수를_다_채우고도_동점이면_10점을_많이_쏜_쪽이_이긴다() {
        // 앞 5발은 총점이 같고 구성만 다르게, 나머지는 양쪽 똑같이 쏜다.
        // 그래야 발수가 같아지는 매 시점에 총점이 같아 서든데스가 이어진다.
        int[] hostFive = {10, 10, 10, 0, 0};
        int[] guestFive = {6, 6, 6, 6, 6};
        int h = 0;
        int g = 0;

        while (room.getState() == ArcheryRoomState.PLAYING) {
            ArcherySeat seat = whoseTurn();
            int score = seat == host()
                    ? (h < hostFive.length ? hostFive[h++] : 5)
                    : (g < guestFive.length ? guestFive[g++] : 5);
            room.shoot(seat, 0.7, 0.8, score);
        }

        assertThat(host().total()).isEqualTo(guest().total());
        assertThat(host().getShots()).hasSize(15);
        // 총점은 같지만 10점을 세 발 더 쏜 host가 이긴다.
        assertThat(listener.finishedWinner).isEqualTo(1L);
        assertThat(listener.finishedReason).isEqualTo(EndReason.SCORE);
    }

    @Test
    void 기권하면_상대가_이긴다() {
        room.resign(host());

        assertThat(room.getState()).isEqualTo(ArcheryRoomState.FINISHED);
        assertThat(listener.finishedWinner).isEqualTo(2L);
        assertThat(listener.finishedReason).isEqualTo(EndReason.RESIGN);
    }

    /** 소켓도 DB도 없이 방을 돌리기 위한 가짜 통로. */
    private static final class FakeListener implements ArcheryRoomListener {
        private final Map<ArcherySeat, List<Map<String, Object>>> sent = new LinkedHashMap<>();
        private final List<Runnable> scheduled = new ArrayList<>();
        private Long finishedWinner;
        private EndReason finishedReason;
        private Boolean lastSuddenDeath;
        private boolean disposed;

        @Override
        public void send(ArcherySeat seat, Map<String, Object> message) {
            if (seat == null) return;
            sent.computeIfAbsent(seat, key -> new ArrayList<>()).add(message);
            if (message.containsKey("suddenDeath")) {
                lastSuddenDeath = (Boolean) message.get("suddenDeath");
            }
        }

        /** 이 자리가 마지막으로 받은 SHOT 메시지. */
        Map<String, Object> lastShotOf(ArcherySeat seat) {
            List<Map<String, Object>> messages = sent.get(seat);
            if (messages == null) return Map.of();

            for (int i = messages.size() - 1; i >= 0; i -= 1) {
                if ("SHOT".equals(messages.get(i).get("type"))) return messages.get(i);
            }
            return Map.of();
        }

        /** 예약된 작업을 전부 실행한다. 유예 타이머를 앞당기는 것과 같다. */
        void runScheduled() {
            List<Runnable> due = new ArrayList<>(scheduled);
            scheduled.clear();
            due.forEach(Runnable::run);
        }

        Boolean lastTurnOf(ArcherySeat seat) {
            List<Map<String, Object>> messages = sent.get(seat);
            if (messages == null) return null;

            for (int i = messages.size() - 1; i >= 0; i -= 1) {
                Object value = messages.get(i).get("yourTurn");
                if (value != null) return (Boolean) value;
            }
            return null;
        }

        @Override
        public RatingChange finish(Long winnerId, Long loserId, EndReason reason) {
            finishedWinner = winnerId;
            finishedReason = reason;
            return new RatingChange(16, 1216, 1184);
        }

        @Override
        public void dispose(ArcheryRoom room) {
            disposed = true;
        }

        @Override
        public Cancellable schedule(Runnable task, int delaySec) {
            scheduled.add(task);
            return () -> scheduled.remove(task);
        }
    }
}
