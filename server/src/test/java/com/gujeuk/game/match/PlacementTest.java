package com.gujeuk.game.match;

import com.gujeuk.game.global.error.GameException;
import com.gujeuk.game.match.domain.Placement;
import com.gujeuk.game.match.domain.Player;
import com.gujeuk.game.match.domain.Stone;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PlacementTest {

    @Test
    void 기본_배치는_규칙을_통과한다() {
        for (Player player : Player.values()) {
            assertThatCode(() -> Placement.validate(player, Placement.defaultFor(player)))
                    .doesNotThrowAnyException();
        }
    }

    @Test
    void 돌_개수가_다르면_거부한다() {
        List<Stone> four = Placement.defaultFor(Player.BLACK).subList(0, 4);

        assertThatThrownBy(() -> Placement.validate(Player.BLACK, four))
                .isInstanceOf(GameException.class)
                .hasMessageContaining("5개");
    }

    @Test
    void 상대_진영에는_놓을_수_없다() {
        // 흑은 아래 절반만 쓸 수 있는데 위쪽 좌표를 보냈다.
        List<Stone> stones = List.of(
                new Stone(100, 100), new Stone(200, 100), new Stone(300, 100),
                new Stone(400, 100), new Stone(500, 100));

        assertThatThrownBy(() -> Placement.validate(Player.BLACK, stones))
                .isInstanceOf(GameException.class)
                .hasMessageContaining("자기 진영");
    }

    @Test
    void 판_밖으로_나가면_거부한다() {
        List<Stone> stones = List.of(
                new Stone(-10, 500), new Stone(200, 500), new Stone(300, 500),
                new Stone(400, 500), new Stone(500, 500));

        assertThatThrownBy(() -> Placement.validate(Player.BLACK, stones))
                .isInstanceOf(GameException.class)
                .hasMessageContaining("판 안에");
    }

    @Test
    void 돌끼리_겹치면_거부한다() {
        List<Stone> stones = List.of(
                new Stone(200, 500), new Stone(210, 500), new Stone(300, 500),
                new Stone(400, 500), new Stone(500, 500));

        assertThatThrownBy(() -> Placement.validate(Player.BLACK, stones))
                .isInstanceOf(GameException.class)
                .hasMessageContaining("겹칠 수 없습니다");
    }

    @Test
    void 자기_진영_경계에_딱_붙는_배치는_허용한다() {
        double y = Placement.BOARD / 2 + Placement.STONE_RADIUS;
        List<Stone> stones = List.of(
                new Stone(100, y), new Stone(200, y), new Stone(300, y),
                new Stone(400, y), new Stone(500, y));

        assertThatCode(() -> Placement.validate(Player.BLACK, stones)).doesNotThrowAnyException();
        assertThat(stones).hasSize(Placement.STONE_COUNT);
    }
}
