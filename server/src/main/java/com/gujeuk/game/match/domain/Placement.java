package com.gujeuk.game.match.domain;

import com.gujeuk.game.global.error.GameException;

import java.util.List;

/**
 * 배치 규칙 검증.
 *
 * 클라가 보낸 좌표를 그대로 믿으면 상대 진영 한복판에 돌을 놓거나 판 밖에
 * 두는 클라를 막을 수 없다. 레이팅이 걸린 게임이므로 서버가 다시 본다.
 */
public final class Placement {
    /** 물리 세계 한 변. 클라의 BOARD와 같아야 한다. */
    public static final double BOARD = 600;
    public static final double STONE_RADIUS = 24;
    public static final int STONE_COUNT = 5;

    /** 좌표가 실수라 부동소수점 오차를 조금 봐준다. */
    private static final double EPSILON = 0.5;

    private Placement() {
    }

    public static void validate(Player player, List<Stone> stones) {
        if (stones == null || stones.size() != STONE_COUNT) {
            throw GameException.badRequest("돌은 정확히 " + STONE_COUNT + "개를 배치해야 합니다.");
        }

        for (Stone stone : stones) {
            validateInsideBoard(stone);
            validateInsideOwnHalf(player, stone);
        }

        validateNoOverlap(stones);
    }

    private static void validateInsideBoard(Stone stone) {
        boolean inside = stone.x() >= STONE_RADIUS - EPSILON
                && stone.x() <= BOARD - STONE_RADIUS + EPSILON
                && stone.y() >= STONE_RADIUS - EPSILON
                && stone.y() <= BOARD - STONE_RADIUS + EPSILON;

        if (!inside) {
            throw GameException.badRequest("판 안에 배치해야 합니다.");
        }
    }

    /** 흑은 아래 절반, 백은 위 절반. 시작부터 상대 진영에 붙이면 첫 턴에 끝난다. */
    private static void validateInsideOwnHalf(Player player, Stone stone) {
        double half = BOARD / 2;

        boolean ok = player == Player.BLACK
                ? stone.y() >= half + STONE_RADIUS - EPSILON
                : stone.y() <= half - STONE_RADIUS + EPSILON;

        if (!ok) {
            throw GameException.badRequest("자기 진영 안에만 배치할 수 있습니다.");
        }
    }

    private static void validateNoOverlap(List<Stone> stones) {
        for (int i = 0; i < stones.size(); i += 1) {
            for (int j = i + 1; j < stones.size(); j += 1) {
                double dx = stones.get(i).x() - stones.get(j).x();
                double dy = stones.get(i).y() - stones.get(j).y();

                if (Math.hypot(dx, dy) < STONE_RADIUS * 2 - EPSILON) {
                    throw GameException.badRequest("돌끼리 겹칠 수 없습니다.");
                }
            }
        }
    }

    /** 제한 시간을 넘겼을 때 쓰는 기본 배치. 자기 진영 안에 가로로 편다. */
    public static List<Stone> defaultFor(Player player) {
        double gap = BOARD / (STONE_COUNT + 1);
        double y = player == Player.BLACK ? BOARD - gap : gap;

        return java.util.stream.IntStream.rangeClosed(1, STONE_COUNT)
                .mapToObj(i -> new Stone(gap * i, y))
                .toList();
    }
}
