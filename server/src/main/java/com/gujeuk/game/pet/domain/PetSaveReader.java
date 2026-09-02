package com.gujeuk.game.pet.domain;

import com.fasterxml.jackson.databind.JsonNode;
import com.gujeuk.game.global.error.GameException;

/**
 * 세이브에서 컬럼으로 꺼낼 값을 뽑고, 형식만 검사한다.
 *
 * 보는 것은 "저장할 수 있는 모양인가"뿐이다 — 객체인가, 필요한 필드가 있는가,
 * 이름이 컬럼 길이에 들어가는가. 값의 타당성(레벨 999 같은 것, 이름이 비어
 * 있는 것)은 보지 않는다. 지금 단계에서는 세이브를 위조해도 남에게 피해가 없는
 * 혼자 하는 게임이고(랭킹이 없다), 막으려는 시도는 전부 우회 가능하면서 코드만
 * 복잡해진다. 서버에만 있는 규칙은 더 나쁘다 — 클라이언트가 만들 수 있는 상태를
 * 서버가 거절하면 그 사람의 진행은 영영 올라가지 못한다.
 *
 * 랭킹이나 친구 방문을 붙이는 순간 이 전제가 깨진다. 그때는 점수를 서버가
 * 검증하거나 계산해야 하고, 이 클래스가 아니라 API 설계 전체를 다시 그려야
 * 한다(PET_SERVER_API.md §7).
 */
public final class PetSaveReader {

    private static final String INVALID = "세이브 형식이 올바르지 않습니다.";

    private PetSaveReader() {
    }

    public static PetSaveContent read(JsonNode save) {
        if (save == null || !save.isObject()) {
            throw GameException.badRequest(INVALID);
        }

        JsonNode pet = object(save, "pet");
        JsonNode wallet = object(save, "wallet");

        return new PetSaveContent(
                name(pet),
                number(pet, "level"),
                number(pet, "exp"),
                number(wallet, "coins"),
                number(save, "version"),
                save
        );
    }

    private static JsonNode object(JsonNode parent, String field) {
        JsonNode value = parent.get(field);

        if (value == null || !value.isObject()) {
            throw GameException.badRequest(INVALID);
        }

        return value;
    }

    private static String name(JsonNode pet) {
        JsonNode value = pet.get("name");

        if (value == null || !value.isTextual()) {
            throw GameException.badRequest(INVALID);
        }

        String name = value.asText();

        // 길이만 본다. 잘라서 저장하면 사용자가 지은 이름이 조용히 바뀌고,
        // 그대로 넣으면 DB가 거절해서 500이 난다. 빈 이름은 막지 않는다 —
        // 컬럼이 받아 주는 값이고, "이름은 비어 있으면 안 된다"는 규칙은
        // 클라이언트(save.ts)의 것이다.
        if (name.length() > Pet.NAME_MAX_LENGTH) {
            throw GameException.badRequest(INVALID);
        }

        return name;
    }

    /**
     * 조회용 컬럼(INT)에 담을 수 있는 정수로 만든다.
     *
     * 소수를 버리는 것은 일부러다. 미니게임 보상이 exp를 소수로 만들기 때문에
     * (economy.ts) 여기서 거절하면 정상적으로 논 사람의 세이브가 올라가지 못한다.
     * 정본은 state_json이고 이 컬럼은 "레벨 10 이상 사용자 수"를 세기 위한
     * 사본이라, 소수점 아래가 잘려도 그 집계는 그대로다.
     *
     * 다만 int 범위를 넘는 값은 잘라 담으면 부호까지 뒤집힌다(30억 → 약 -12억).
     * 그러면 사본이 원본보다 작아져서 집계가 조용히 틀리므로, 넘치는 쪽 끝으로
     * 붙인다. 거절하지 않는 이유는 위와 같다 — 값의 타당성은 서버가 보지 않는다.
     */
    private static int number(JsonNode parent, String field) {
        JsonNode value = parent.get(field);

        if (value == null || !value.isNumber()) {
            throw GameException.badRequest(INVALID);
        }

        if (value.canConvertToInt()) {
            return value.intValue();
        }

        return value.doubleValue() > 0 ? Integer.MAX_VALUE : Integer.MIN_VALUE;
    }
}
