package com.gujeuk.game.pet;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gujeuk.game.global.error.GameException;
import com.gujeuk.game.pet.domain.Pet;
import com.gujeuk.game.pet.domain.PetRepository;
import com.gujeuk.game.pet.domain.PetSnapshot;
import com.gujeuk.game.pet.service.PetSaveResult;
import com.gujeuk.game.pet.service.PetService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

@SpringBootTest
@Transactional
class PetServiceTest {

    /** 기기 하나를 번갈아 쓰는 두 사람. */
    private static final long ME = 1L;
    private static final long NEXT_PERSON = 2L;

    @Autowired
    private PetService petService;

    @Autowired
    private PetRepository petRepository;

    @Autowired
    private ObjectMapper objectMapper;

    @PersistenceContext
    private EntityManager entityManager;

    @Test
    void 서버에_아무것도_없으면_처음_올리기가_새로_만든다() {
        PetSaveResult result = petService.save(ME, save("몰랑", 3, 40, 230), null);

        long syncedAt = saved(result);
        assertThat(petService.find(ME)).isPresent();
        assertThat(petService.find(ME).orElseThrow().syncedAt()).isEqualTo(syncedAt);
    }

    @Test
    void 올바른_baseSyncedAt으로_이어_올리면_통과하고_시각이_바뀐다() {
        long first = saved(petService.save(ME, save("몰랑", 3, 40, 230), null));

        long second = saved(petService.save(ME, save("몰랑", 4, 0, 400), first));

        assertThat(second).isGreaterThan(first);
        assertThat(petService.find(ME).orElseThrow().syncedAt()).isEqualTo(second);
        assertThat(petRepository.findByMemberId(ME).orElseThrow().getLevel()).isEqualTo(4);
    }

    @Test
    void 같은_baseSyncedAt으로_두_번째_올리면_충돌이다() {
        long first = saved(petService.save(ME, save("몰랑", 3, 40, 230), null));

        // 기기 A가 올려서 서버 시각이 옮겨간다.
        long second = saved(petService.save(ME, save("몰랑", 9, 0, 900), first));

        // 기기 B는 아직 first를 들고 있다. 덮어쓰게 두면 A의 진행이 사라진다.
        PetSaveResult result = petService.save(ME, save("몰랑", 4, 0, 400), first);

        assertThat(conflict(result).syncedAt()).isEqualTo(second);
        assertThat(petRepository.findByMemberId(ME).orElseThrow().getLevel()).isEqualTo(9);
    }

    @Test
    void baseSyncedAt이_null인데_이미_있으면_충돌이다() {
        long first = saved(petService.save(ME, save("몰랑", 3, 40, 230), null));

        PetSaveResult result = petService.save(ME, save("처음부터", 1, 0, 0), null);

        assertThat(conflict(result).syncedAt()).isEqualTo(first);
        assertThat(petRepository.findByMemberId(ME).orElseThrow().getName()).isEqualTo("몰랑");
    }

    @Test
    void 충돌_응답에는_서버의_세이브가_그대로_실린다() {
        petService.save(ME, save("몰랑", 3, 40, 230), null);

        PetSaveResult result = petService.save(ME, save("다른펫", 1, 0, 0), null);

        // 한 번 더 받으러 가지 않고도 "어느 쪽을 쓸까요"를 그릴 수 있어야 한다.
        assertThat(conflict(result).save().get("pet").get("name").asText()).isEqualTo("몰랑");
    }

    @Test
    void 서버에_없는데_baseSyncedAt이_있으면_새로_만든다() {
        // 서버 데이터가 지워진 경우다. 여기서 막으면 사용자는 영영 올릴 수 없다.
        PetSaveResult result = petService.save(ME, save("몰랑", 3, 40, 230), 1788262700123L);

        assertThat(saved(result)).isPositive();
        assertThat(petRepository.findByMemberId(ME)).isPresent();
    }

    @Test
    void 다른_회원의_펫은_보이지도_덮이지도_않는다() {
        long mine = saved(petService.save(ME, save("몰랑", 3, 40, 230), null));

        // 다음 사람은 서버가 비어 있는 것으로 보여야 한다.
        assertThat(petService.find(NEXT_PERSON)).isEmpty();

        // 앞사람의 진행이 있어도 충돌이 나지 않는다. 서로 다른 칸이다.
        long theirs = saved(petService.save(NEXT_PERSON, save("두부", 1, 0, 0), null));

        assertThat(petService.find(ME).orElseThrow().syncedAt()).isEqualTo(mine);
        assertThat(petRepository.findByMemberId(ME).orElseThrow().getName()).isEqualTo("몰랑");
        assertThat(petRepository.findByMemberId(NEXT_PERSON).orElseThrow().getName()).isEqualTo("두부");
        assertThat(theirs).isNotZero();
    }

    @Test
    void 지우기는_자기_것만_지우고_두_번_해도_같다() {
        petService.save(ME, save("몰랑", 3, 40, 230), null);
        petService.save(NEXT_PERSON, save("두부", 1, 0, 0), null);

        petService.delete(ME);
        petService.delete(ME);

        assertThat(petService.find(ME)).isEmpty();
        assertThat(petService.find(NEXT_PERSON)).isPresent();
    }

    @Test
    void 컬럼_값은_세이브에서_뽑아_채운다() {
        petService.save(ME, save("몰랑", 3, 40, 230), null);

        Pet pet = petRepository.findByMemberId(ME).orElseThrow();

        // 클라이언트가 따로 보낸 값이 아니라 세이브 안의 값이어야 한다.
        assertThat(pet.getName()).isEqualTo("몰랑");
        assertThat(pet.getLevel()).isEqualTo(3);
        assertThat(pet.getExp()).isEqualTo(40);
        assertThat(pet.getCoins()).isEqualTo(230);
        assertThat(pet.getSaveVersion()).isEqualTo(1);
    }

    @Test
    void 세이브는_받은_모양_그대로_돌아온다() {
        JsonNode original = save("몰랑", 3, 40, 230);

        petService.save(ME, original, null);

        // 영속성 컨텍스트에 남은 객체가 아니라 DB에 들어갔다 나온 값을 본다.
        // JSON 컬럼은 문서로 넣지 않으면 따옴표에 싸인 문자열로 저장되는데,
        // 그러면 클라이언트가 다음에 받는 세이브가 통째로 깨진다.
        entityManager.flush();
        entityManager.clear();

        assertThat(petService.find(ME).orElseThrow().save()).isEqualTo(original);
    }

    @Test
    void 알_수_없는_version도_해석하지_않고_보관한다() {
        // 서버가 버전을 막으면 클라이언트를 새로 배포할 때마다 서버도 같이 배포해야 한다.
        JsonNode future = read(json("몰랑", 3, 40, 230).replace("\"version\": 1", "\"version\": 99"));

        petService.save(ME, future, null);

        assertThat(petRepository.findByMemberId(ME).orElseThrow().getSaveVersion()).isEqualTo(99);
        assertThat(petService.find(ME).orElseThrow().save()).isEqualTo(future);
    }

    @Test
    void 레벨_999도_막지_않는다() {
        // 혼자 하는 게임이고 랭킹이 없다. 값의 타당성은 서버가 보지 않는다.
        PetSaveResult result = petService.save(ME, save("몰랑", 999, 0, 0), null);

        assertThat(saved(result)).isPositive();
    }

    @Test
    void 모양이_어긋난_세이브는_400이다() {
        assertThat(badRequest(null)).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(badRequest(read("[]"))).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(badRequest(read("{\"version\": 1}"))).isEqualTo(HttpStatus.BAD_REQUEST);
        // 이름이 컬럼(16자)에 들어가지 않으면 잘라 넣지 않고 막는다.
        assertThat(badRequest(save("가나다라마바사아자차카타파하거너더", 1, 0, 0))).isEqualTo(HttpStatus.BAD_REQUEST);

        assertThat(petRepository.findByMemberId(ME)).isEmpty();
    }

    @Test
    void 형식_검사는_저장_전에_끝난다() {
        petService.save(ME, save("몰랑", 3, 40, 230), null);

        // 잘못된 세이브가 기존 진행을 건드리면 안 된다.
        assertThatThrownBy(() -> petService.save(ME, read("{}"), null))
                .isInstanceOf(GameException.class);

        assertThat(petRepository.findByMemberId(ME).orElseThrow().getName()).isEqualTo("몰랑");
    }

    @Test
    void 값의_타당성은_보지_않는다() {
        // 컬럼이 받아 주는 값이면 올라간다. 서버에만 있는 규칙을 두면 그 상태를
        // 만들 수 있는 클라이언트의 진행이 영영 올라가지 못한다.
        assertThat(saved(petService.save(ME, save("", 1, 0, 0), null))).isPositive();
        assertThat(petRepository.findByMemberId(ME).orElseThrow().getName()).isEmpty();
    }

    @Test
    void 소수인_exp도_올라간다() {
        // 미니게임 보상이 exp를 소수로 만든다(economy.ts). 여기서 막으면 정상적으로
        // 논 사람의 세이브가 올라가지 못한다. 컬럼은 조회용 사본이라 잘려도 되고,
        // 정본인 state_json에는 소수 그대로 남는다.
        JsonNode fraction = read(json("몰랑", 3, 40, 230).replace("\"exp\": 40", "\"exp\": 213.5"));

        assertThat(saved(petService.save(ME, fraction, null))).isPositive();

        Pet pet = petRepository.findByMemberId(ME).orElseThrow();
        assertThat(pet.getExp()).isEqualTo(213);
        assertThat(pet.getSave().get("pet").get("exp").asDouble()).isEqualTo(213.5);
    }

    @Test
    void 컬럼에_담기지_않는_큰_수는_부호가_뒤집히지_않는다() {
        // 그냥 잘라 담으면 30억이 약 -12억이 되어, "레벨 10 이상"을 세는 순간
        // 이 행만 조용히 빠진다. 컬럼은 사본이므로 원본보다 작아지면 안 된다.
        JsonNode huge = read(json("몰랑", 1, 0, 0)
                .replace("\"level\": 1", "\"level\": 3000000000")
                .replace("\"coins\": 0", "\"coins\": 5000000000"));

        assertThat(saved(petService.save(ME, huge, null))).isPositive();

        Pet pet = petRepository.findByMemberId(ME).orElseThrow();
        assertThat(pet.getLevel()).isEqualTo(Integer.MAX_VALUE);
        assertThat(pet.getCoins()).isEqualTo(Integer.MAX_VALUE);
        assertThat(pet.getSave().get("pet").get("level").asLong()).isEqualTo(3000000000L);
    }

    @Test
    void 미래의_baseSyncedAt이_서버_시각을_대신하지_못한다() {
        long tenYearsLater = System.currentTimeMillis() + 10L * 365 * 24 * 60 * 60 * 1000;

        // 서버에 아무것도 없을 때는 baseSyncedAt을 어떤 행과도 대조하지 않는다.
        // 그 값을 그대로 저장하면 기기 시계가 틀린 사람 하나가 자기 synced_at을
        // 몇 년 뒤로 박아 넣고, 그 뒤로는 서버 시계로 돌아올 길이 없다.
        long first = saved(petService.save(ME, save("몰랑", 3, 40, 230), tenYearsLater));

        assertThat(first).isLessThan(tenYearsLater);
        assertThat(first).isCloseTo(System.currentTimeMillis(), within(60_000L));

        // 그 다음 저장도 서버 시각을 따라간다.
        long second = saved(petService.save(ME, save("몰랑", 4, 0, 400), first));

        assertThat(second).isGreaterThan(first);
        assertThat(second).isLessThan(tenYearsLater);
    }

    @Test
    void 담을_수_없는_시각은_500이_아니라_충돌이다() {
        long first = saved(petService.save(ME, save("몰랑", 3, 40, 230), null));

        // DATETIME이 담지 못하는 값이다. 그대로 조회에 넘기면 드라이버가 깨진다.
        PetSaveResult result = petService.save(ME, save("몰랑", 4, 0, 400), Long.MAX_VALUE);

        assertThat(conflict(result).syncedAt()).isEqualTo(first);
        assertThat(petRepository.findByMemberId(ME).orElseThrow().getLevel()).isEqualTo(3);
    }

    private HttpStatus badRequest(JsonNode save) {
        try {
            petService.save(ME, save, null);
            throw new AssertionError("400이 나야 한다");
        } catch (GameException exception) {
            return exception.getStatus();
        }
    }

    private long saved(PetSaveResult result) {
        assertThat(result).isInstanceOf(PetSaveResult.Saved.class);
        return ((PetSaveResult.Saved) result).syncedAt();
    }

    private PetSnapshot conflict(PetSaveResult result) {
        assertThat(result).isInstanceOf(PetSaveResult.Conflict.class);
        return ((PetSaveResult.Conflict) result).server();
    }

    private JsonNode save(String name, int level, int exp, int coins) {
        return read(json(name, level, exp, coins));
    }

    private String json(String name, int level, int exp, int coins) {
        return """
                {
                  "version": 1,
                  "pet": { "name": "%s", "bornAt": 1788000000000, "level": %d, "exp": %d },
                  "stats": { "hunger": 72.5, "mood": 88, "clean": 61, "energy": 94 },
                  "wallet": { "coins": %d },
                  "inventory": { "apple": 2, "cushion": 1 },
                  "room": { "wallpaper": "default", "floor": "default", "placed": [] },
                  "sleep": null,
                  "tutorial": { "step": 7, "done": true },
                  "daily": { "date": "2026-09-02", "coinsEarned": 120, "checkedIn": true, "pets": 3 },
                  "lastSeenAt": 1788262698607
                }
                """.formatted(name, level, exp, coins);
    }

    private JsonNode read(String json) {
        try {
            return objectMapper.readTree(json);
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException(exception);
        }
    }
}
