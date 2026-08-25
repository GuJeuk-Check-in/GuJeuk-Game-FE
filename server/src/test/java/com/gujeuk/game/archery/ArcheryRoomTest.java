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
    void 기권하면_상대가_이긴다() {
        room.resign(host());

        assertThat(room.getState()).isEqualTo(ArcheryRoomState.FINISHED);
        assertThat(listener.finishedWinner).isEqualTo(2L);
        assertThat(listener.finishedReason).isEqualTo(EndReason.RESIGN);
    }

    /** 소켓도 DB도 없이 방을 돌리기 위한 가짜 통로. */
    private static final class FakeListener implements ArcheryRoomListener {
        private final Map<ArcherySeat, List<Map<String, Object>>> sent = new LinkedHashMap<>();
        private Long finishedWinner;
        private EndReason finishedReason;
        private Boolean lastSuddenDeath;

        @Override
        public void send(ArcherySeat seat, Map<String, Object> message) {
            if (seat == null) return;
            sent.computeIfAbsent(seat, key -> new ArrayList<>()).add(message);
            if (message.containsKey("suddenDeath")) {
                lastSuddenDeath = (Boolean) message.get("suddenDeath");
            }
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
        }

        @Override
        public Cancellable schedule(Runnable task, int delaySec) {
            return () -> {
            };
        }
    }
}
