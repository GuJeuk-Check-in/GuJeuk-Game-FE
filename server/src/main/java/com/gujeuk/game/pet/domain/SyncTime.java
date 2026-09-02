package com.gujeuk.game.pet.domain;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;

/**
 * 동기화 시각(synced_at)과 epoch 밀리초 사이의 변환.
 *
 * API는 밀리초 숫자를 주고받고 DB는 DATETIME(3)이라 경계에서 한 번 바꿔야
 * 한다. 그 규칙을 한 곳에만 둔다 — 두 곳에서 각자 바꾸면 언젠가 한쪽만 고쳐지고,
 * 그러면 클라이언트가 되돌려 보낸 baseSyncedAt이 영영 맞지 않는다.
 *
 * 변환 기준을 UTC로 고정한다. 시스템 기본 시간대를 쓰면 서머타임이 있는
 * 지역에서 겹치는 한 시간 동안 밀리초 → LocalDateTime → 밀리초 왕복이 원래
 * 값과 달라진다. 이 값은 사람이 읽는 시각이 아니라 충돌 판정에 쓰는 토큰이므로,
 * 읽기 좋은 것보다 왕복이 정확한 쪽이 중요하다.
 *
 * 값을 언제나 밀리초 단위로 만들어 쓰는 것도 같은 이유다. 나노초가 붙은
 * 시각을 넣으면 DATETIME(3)이 반올림해서 저장하고, 응답으로 돌려준 syncedAt과
 * DB에 남은 값이 달라져 다음 저장이 통과하지 못한다.
 */
public final class SyncTime {

    /**
     * MySQL DATETIME이 담을 수 있는 범위. 밖의 값은 컬럼과 대조할 수조차 없다.
     *
     * 자바의 LocalDateTime은 서기 10000년도 태연히 만들어 내서, 범위를 여기서
     * 보지 않으면 터지는 자리가 드라이버 안이 된다. H2로 도는 테스트는 그것을
     * 잡지 못하므로(테스트는 MySQL 없이 돈다) 경계를 코드로 남긴다.
     */
    private static final long MIN_STORABLE = millisAt(1000, 1, 1);
    private static final long MAX_STORABLE = millisAt(9999, 12, 31);

    private SyncTime() {
    }

    public static LocalDateTime at(long epochMillis) {
        return LocalDateTime.ofInstant(Instant.ofEpochMilli(epochMillis), ZoneOffset.UTC);
    }

    public static long millis(LocalDateTime syncedAt) {
        return syncedAt.toInstant(ZoneOffset.UTC).toEpochMilli();
    }

    /** synced_at 컬럼에 담을 수 있는 값인가. 클라이언트가 보낸 시각을 믿기 전에 본다. */
    public static boolean isStorable(long epochMillis) {
        return epochMillis >= MIN_STORABLE && epochMillis < MAX_STORABLE;
    }

    private static long millisAt(int year, int month, int day) {
        return LocalDateTime.of(year, month, day, 0, 0).toInstant(ZoneOffset.UTC).toEpochMilli();
    }
}
