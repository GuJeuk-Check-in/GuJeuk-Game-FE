package com.gujeuk.game.tictactoe;

import com.gujeuk.game.tictactoe.domain.Mark;
import com.gujeuk.game.tictactoe.domain.TicTacToeGame;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 서버 규칙이 클라이언트(rules.ts)와 같은 답을 내는지 확인한다.
 * 여기 시나리오는 브라우저에서 검증한 것과 같은 상황을 그대로 옮긴 것이다.
 */
class TicTacToeGameTest {

    /** 번갈아 두는 편의 메서드. 이기면 도중에 멈춘다. */
    private TicTacToeGame play(int... moves) {
        TicTacToeGame game = new TicTacToeGame();
        for (int move : moves) {
            if (game.isOver()) break;
            game.place(game.getTurn(), move);
        }
        return game;
    }

    @Test
    void 세_칸을_이으면_이긴다() {
        TicTacToeGame game = play(0, 3, 1, 4, 2);

        assertThat(game.getWinner()).isEqualTo(Mark.X);
        assertThat(game.getWinningLine()).containsExactly(0, 1, 2);
    }

    @Test
    void 네번째를_놓으면_가장_오래된_말이_사라진다() {
        // X: 0,1,6   O: 3,7,8  — 어느 쪽도 줄이 아니다
        TicTacToeGame game = play(0, 3, 1, 7, 6, 8);
        assertThat(game.isOver()).isFalse();
        assertThat(game.vanishingCell(Mark.X)).isEqualTo(0);

        int vanished = game.place(Mark.X, 2);

        assertThat(vanished).isEqualTo(0);
        assertThat(game.boardView().get(0)).isNull();
        assertThat(game.boardView().get(2)).isEqualTo("x");
    }

    @Test
    void 놓은_뒤에_걷어내므로_스스로_줄을_무너뜨린다() {
        // X가 0,1,6을 갖고 2에 두면 놓는 순간엔 0,1,2 줄이지만
        // 가장 오래된 0이 걷어내지므로 이기지 못한다. 이 게임의 핵심 규칙이다.
        TicTacToeGame game = play(0, 3, 1, 7, 6, 8);

        game.place(Mark.X, 2);

        assertThat(game.getWinner()).isNull();
        assertThat(game.getTurn()).isEqualTo(Mark.O);
    }

    @Test
    void 판이_꽉_차지_않아_무승부가_없다() {
        // 양쪽이 최대 3개씩만 올릴 수 있으므로 판 위의 말은 6개를 넘지 못한다.
        TicTacToeGame game = play(0, 3, 1, 7, 6, 8);
        game.place(Mark.X, 2);
        game.place(Mark.O, 5);

        long occupied = game.boardView().stream().filter(cell -> cell != null).count();

        assertThat(occupied).isLessThanOrEqualTo(2L * TicTacToeGame.MARKS_PER_PLAYER);
        assertThat(game.isOver()).isFalse();
    }

    @Test
    void 남의_차례에는_둘_수_없다() {
        TicTacToeGame game = new TicTacToeGame();

        assertThatThrownBy(() -> game.place(Mark.O, 0))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("차례");
    }

    @Test
    void 이미_놓인_칸에는_둘_수_없다() {
        TicTacToeGame game = new TicTacToeGame();
        game.place(Mark.X, 4);

        assertThatThrownBy(() -> game.place(Mark.O, 4))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("이미 놓인");
    }

    @Test
    void 끝난_판에는_더_둘_수_없다() {
        TicTacToeGame game = play(0, 3, 1, 4, 2);

        assertThatThrownBy(() -> game.place(Mark.O, 5))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("끝난");
    }

    @Test
    void 기권하면_상대가_이긴다() {
        TicTacToeGame game = new TicTacToeGame();

        game.concede(Mark.X);

        assertThat(game.getWinner()).isEqualTo(Mark.O);
    }
}
