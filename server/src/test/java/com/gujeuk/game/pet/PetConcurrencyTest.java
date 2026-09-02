package com.gujeuk.game.pet;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gujeuk.game.pet.domain.PetRepository;
import com.gujeuk.game.pet.service.PetSaveResult;
import com.gujeuk.game.pet.service.PetService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 같은 회원의 요청이 동시에 들어와도 하나만 이긴다.
 *
 * 이 클래스에는 {@code @Transactional}이 없다. 다른 펫 테스트처럼 붙이면
 * 서비스가 부르는 리포지토리 호출이 전부 테스트 트랜잭션 하나에 합쳐져서,
 * "호출 하나하나가 자기 트랜잭션에서 끝난다"는 이 설계의 전제가 테스트에서는
 * 만들어지지 않는다. 그 상태로는 PetService에 {@code @Transactional}을 붙여도
 * 모든 테스트가 초록으로 남는다 — 실제로는 충돌한 요청이 409 대신 500을 받는데도.
 *
 * 트랜잭션이 없으니 정리도 스스로 한다. 다른 테스트와 겹치지 않는 회원 id를
 * 쓰고 끝에 지운다.
 */
@SpringBootTest
class PetConcurrencyTest {

    /** 다른 펫 테스트가 쓰지 않는 번호. 롤백이 없어 행이 실제로 남는다. */
    private static final long MEMBER = 900L;

    private static final int THREADS = 8;

    @Autowired
    private PetService petService;

    @Autowired
    private PetRepository petRepository;

    @Autowired
    private ObjectMapper objectMapper;

    @AfterEach
    void 지운다() {
        petRepository.deleteByMemberId(MEMBER);
    }

    @Test
    void 처음_올리기가_한꺼번에_와도_하나만_만들어진다() throws Exception {
        List<PetSaveResult> results = inParallel(index -> petService.save(MEMBER, save(index), null));

        assertThat(saved(results)).isEqualTo(1);
        assertThat(petRepository.findByMemberId(MEMBER)).isPresent();
        // 진 쪽은 이긴 쪽이 방금 올린 것을 보고 물어야 한다. 덮어쓰면 진행이 사라진다.
        assertThat(conflicts(results)).isEqualTo(THREADS - 1);
    }

    @Test
    void 같은_baseSyncedAt으로_한꺼번에_올리면_하나만_통과한다() throws Exception {
        PetSaveResult first = petService.save(MEMBER, save(0), null);
        long base = ((PetSaveResult.Saved) first).syncedAt();

        List<PetSaveResult> results = inParallel(index -> petService.save(MEMBER, save(index), base));

        assertThat(saved(results)).isEqualTo(1);
        assertThat(conflicts(results)).isEqualTo(THREADS - 1);

        // 이긴 저장의 시각이 곧 DB의 시각이다. 어긋나면 그 클라이언트의 다음
        // 저장이 자기가 방금 받은 값으로도 통과하지 못한다.
        long winner = results.stream()
                .filter(PetSaveResult.Saved.class::isInstance)
                .map(result -> ((PetSaveResult.Saved) result).syncedAt())
                .findFirst()
                .orElseThrow();

        assertThat(petService.find(MEMBER).orElseThrow().syncedAt()).isEqualTo(winner);
        assertThat(winner).isGreaterThan(base);
    }

    private List<PetSaveResult> inParallel(Attempt attempt) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(THREADS);
        CyclicBarrier gate = new CyclicBarrier(THREADS);

        try {
            List<Future<PetSaveResult>> futures = new ArrayList<>();

            for (int index = 0; index < THREADS; index++) {
                int number = index;
                Callable<PetSaveResult> task = () -> {
                    gate.await();
                    return attempt.run(number);
                };
                futures.add(pool.submit(task));
            }

            List<PetSaveResult> results = new ArrayList<>();

            for (Future<PetSaveResult> future : futures) {
                // 예외가 하나라도 나면 여기서 터진다. 사용자에게는 500이 나갔다는 뜻이다.
                results.add(future.get());
            }

            return results;
        } finally {
            pool.shutdownNow();
        }
    }

    private long saved(List<PetSaveResult> results) {
        return results.stream().filter(PetSaveResult.Saved.class::isInstance).count();
    }

    private long conflicts(List<PetSaveResult> results) {
        return results.stream().filter(PetSaveResult.Conflict.class::isInstance).count();
    }

    private JsonNode save(int index) {
        String json = """
                {
                  "version": 1,
                  "pet": { "name": "몰랑%d", "bornAt": 1788000000000, "level": %d, "exp": 0 },
                  "stats": { "hunger": 72.5, "mood": 88, "clean": 61, "energy": 94 },
                  "wallet": { "coins": 0 },
                  "inventory": {},
                  "room": { "wallpaper": "default", "floor": "default", "placed": [] },
                  "sleep": null,
                  "tutorial": { "step": 7, "done": true },
                  "daily": { "date": "2026-09-02", "coinsEarned": 0, "checkedIn": true, "pets": 0 },
                  "lastSeenAt": 1788262698607
                }
                """.formatted(index, index + 1);

        try {
            return objectMapper.readTree(json);
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException(exception);
        }
    }

    @FunctionalInterface
    private interface Attempt {
        PetSaveResult run(int index);
    }
}
