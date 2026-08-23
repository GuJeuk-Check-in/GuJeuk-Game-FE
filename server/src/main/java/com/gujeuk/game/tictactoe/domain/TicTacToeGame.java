package com.gujeuk.game.tictactoe.domain;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Deque;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * 틱택토 규칙.
 *
 * 일반 틱택토가 아니다. 한쪽이 판에 올릴 수 있는 말은 {@link #MARKS_PER_PLAYER}개
 * 까지이고, 그 상태에서 또 놓으면 자기 말 중 가장 오래된 것이 사라진다.
 * 그래서 판이 꽉 차지 않고 무승부도 없다.
 *
 * ─── 이 클래스가 서버에 있는 이유 ────────────────────────────────────────
 * 같은 규칙이 클라이언트(apps/tic-tac-toe/src/game/rules.ts)에도 있다. 규칙이
 * 두 곳에 있는 건 좋지 않지만, 온라인 대전에서는 피할 수 없다 — 클라만 믿으면
 * 고친 클라로 남의 칸에 두거나 차례를 건너뛸 수 있다. 클라의 규칙은 화면을
 * 즉시 그리기 위한 것이고, 판정의 진실은 여기다.
 *
 * 알까기와 달리 락스텝이 필요 없다. 물리 계산이 없어서 서버가 직접 판을
 * 굴려도 부담이 없고, 매 수마다 판 전체를 내려보내면 디싱크 자체가 생기지 않는다.
 * ─────────────────────────────────────────────────────────────────────────
 */
public class TicTacToeGame {
    /**
     * 한쪽이 판에 동시에 올릴 수 있는 말의 수.
     *
     * 클라이언트의 MARKS_PER_PLAYER와 반드시 같아야 한다. 다르면 사라지는 말이
     * 서로 달라 화면과 판정이 어긋난다.
     */
    public static final int MARKS_PER_PLAYER = 3;

    public static final int SIZE = 9;

    private static final int[][] LINES = {
            {0, 1, 2}, {3, 4, 5}, {6, 7, 8},
            {0, 3, 6}, {1, 4, 7}, {2, 5, 8},
            {0, 4, 8}, {2, 4, 6},
    };

    private final Mark[] board = new Mark[SIZE];
    /** 각자 놓은 칸을 놓은 순서대로. 앞이 가장 오래된 수다. */
    private final Map<Mark, Deque<Integer>> placed = new EnumMap<>(Mark.class);

    private Mark turn = Mark.X;
    private Mark winner;
    private int[] winningLine;

    public TicTacToeGame() {
        placed.put(Mark.X, new ArrayDeque<>());
        placed.put(Mark.O, new ArrayDeque<>());
    }

    public Mark getTurn() {
        return turn;
    }

    public Mark getWinner() {
        return winner;
    }

    public boolean isOver() {
        return winner != null;
    }

    /** 이긴 줄. 아직 승자가 없으면 null. */
    public int[] getWinningLine() {
        return winningLine == null ? null : winningLine.clone();
    }

    /**
     * 한 수를 둔다.
     *
     * 순서가 규칙 그 자체다. **놓고 나서 걷어낸다.** 걷어내기를 먼저 하면 방금
     * 놓은 수가 이미 빠진 자리와 줄을 이룰 수 있어 규칙이 헐거워진다. 이 순서
     * 덕분에 "세 칸을 다 이었는데 그 줄에 내 가장 오래된 말이 있어 스스로
     * 무너뜨리는" 이 게임의 핵심 긴장이 생긴다.
     *
     * @return 이 수로 사라진 칸. 사라진 게 없으면 -1.
     * @throws IllegalStateException 둘 수 없는 상황이면
     */
    public int place(Mark mark, int index) {
        if (isOver()) throw new IllegalStateException("이미 끝난 판입니다.");
        if (mark != turn) throw new IllegalStateException("당신 차례가 아닙니다.");
        if (index < 0 || index >= SIZE) throw new IllegalStateException("판 밖입니다.");
        if (board[index] != null) throw new IllegalStateException("이미 놓인 칸입니다.");

        board[index] = mark;

        Deque<Integer> mine = placed.get(mark);
        mine.addLast(index);

        int vanished = -1;
        if (mine.size() > MARKS_PER_PLAYER) {
            vanished = mine.removeFirst();
            board[vanished] = null;
        }

        detectWinner();
        if (!isOver()) turn = turn.opponent();

        return vanished;
    }

    private void detectWinner() {
        for (int[] line : LINES) {
            Mark mark = board[line[0]];
            if (mark != null && mark == board[line[1]] && mark == board[line[2]]) {
                winner = mark;
                winningLine = line;
                return;
            }
        }
    }

    /** 다음 수에 사라질 칸. 아직 한도에 안 찼으면 -1. */
    public int vanishingCell(Mark mark) {
        Deque<Integer> mine = placed.get(mark);
        return mine.size() >= MARKS_PER_PLAYER ? mine.peekFirst() : -1;
    }

    /** 클라이언트로 내려보낼 판. 빈 칸은 null이다. */
    public List<String> boardView() {
        List<String> view = new ArrayList<>(SIZE);
        for (Mark cell : board) {
            view.add(cell == null ? null : cell.lower());
        }
        return view;
    }

    /** 판정을 끝낸 뒤 기권 등으로 승자를 지정한다. */
    public void concede(Mark loser) {
        if (isOver()) return;
        winner = loser.opponent();
    }

    @Override
    public String toString() {
        return Arrays.toString(board);
    }
}
