package com.gujeuk.game.pet.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.gujeuk.game.pet.domain.Pet;
import com.gujeuk.game.pet.domain.PetRepository;
import com.gujeuk.game.pet.domain.PetSaveContent;
import com.gujeuk.game.pet.domain.PetSaveReader;
import com.gujeuk.game.pet.domain.PetSnapshot;
import com.gujeuk.game.pet.domain.SyncTime;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Optional;

/**
 * 펫 세이브를 보관하고 돌려준다.
 *
 * 회원 한 명이 자기 것만 다룬다. 회원 식별자는 언제나 토큰에서 온 것이고
 * (JwtFilter가 principal에 넣는 memberId), 요청 본문에서 받지 않는다. 이 게임은
 * 기관에서 한 대의 기기를 여러 사람이 번갈아 쓰기 때문에, 회원을 요청으로
 * 지정할 수 있으면 앞사람의 펫이 뒷사람에게 그대로 넘어간다.
 *
 * 올리기({@link #save})에 트랜잭션을 걸지 않는 것은 일부러다. 리포지토리 호출
 * 하나하나가 자기 트랜잭션에서 끝나야, 충돌을 확인한 뒤 다시 읽는 값이 방금 다른
 * 요청이 커밋한 최신 상태가 된다({@link PetRepository#updateIfUnchanged} 주석).
 * 읽기만 하는 {@link #find}는 다시 읽을 것이 없어 해당하지 않는다.
 */
@Service
@RequiredArgsConstructor
public class PetService {

    private final PetRepository petRepository;

    @Transactional(readOnly = true)
    public Optional<PetSnapshot> find(Long memberId) {
        return petRepository.findByMemberId(memberId).map(Pet::snapshot);
    }

    /**
     * 세이브를 통째로 덮어쓴다. 필드 단위로 합치지 않는다 — 세이브는 한 덩어리다.
     *
     * 세 갈래다.
     *
     * - 알고 있던 시각이 그대로면 → 덮어쓴다
     * - 서버에 이미 다른 진행이 있으면 → 충돌. 서버 상태를 실어 돌려준다
     * - 서버에 아무것도 없으면 → 새로 만든다. baseSyncedAt이 있어도 막지 않는다.
     *   서버 데이터가 지워진 경우이고, 여기서 막으면 사용자는 자기 진행을 영영
     *   올릴 수 없다
     */
    public PetSaveResult save(Long memberId, JsonNode save, Long baseSyncedAt) {
        PetSaveContent content = PetSaveReader.read(save);

        if (baseSyncedAt != null) {
            LocalDateTime overwritten = overwrite(memberId, baseSyncedAt, content);

            if (overwritten != null) {
                return new PetSaveResult.Saved(SyncTime.millis(overwritten));
            }
        }

        // 여기까지 왔다는 것은 조건이 맞지 않았거나(충돌) 아직 행이 없다는 뜻이다.
        // 둘 중 무엇인지는 지금 다시 읽어야 알 수 있다.
        return petRepository.findByMemberId(memberId)
                .<PetSaveResult>map(pet -> new PetSaveResult.Conflict(pet.snapshot()))
                .orElseGet(() -> create(memberId, content));
    }

    /** 지웠거나, 원래 없었다. 어느 쪽이든 같은 결과다. */
    public void delete(Long memberId) {
        petRepository.deleteByMemberId(memberId);
    }

    /** 덮어썼으면 새 시각, 조건이 맞지 않았으면 null. */
    private LocalDateTime overwrite(Long memberId, long baseSyncedAt, PetSaveContent content) {
        if (!SyncTime.isStorable(baseSyncedAt)) {
            // 서버가 준 적 없는 시각이다. 어떤 행과도 맞을 수 없으므로 조건 불일치와
            // 똑같이 흘려보낸다. 그대로 DB에 넘기면 DATETIME 범위를 벗어난 값이라
            // 조회 자체가 깨져서, 사용자는 409 대신 500을 받는다.
            return null;
        }

        LocalDateTime syncedAt = SyncTime.at(nextSyncedAt(baseSyncedAt));
        int updated = petRepository.updateIfUnchanged(
                memberId,
                SyncTime.at(baseSyncedAt),
                syncedAt,
                content.name(),
                content.level(),
                content.exp(),
                content.coins(),
                content.saveVersion(),
                content.save()
        );

        return updated == 1 ? syncedAt : null;
    }

    /**
     * 처음 올리는 경우다. 시각은 서버 시계로만 정한다.
     *
     * baseSyncedAt이 함께 와도 쓰지 않는다. 이 갈래는 "DB에 없는데 baseSyncedAt이
     * 있으면 그냥 새로 만든다"(명세 §5)라서 클라이언트가 보낸 숫자를 아무 행과도
     * 대조하지 않는데, 그것을 그대로 저장하면 기기 시계가 틀린 사람 하나가 자기
     * synced_at을 몇 년 뒤로 박아 넣게 된다. 한 번 미래로 가면 그 뒤로는 서버
     * 시각이 언제나 그 값보다 작아서, 저장할 때마다 1밀리초씩만 올라갈 뿐
     * 서버 시계로 돌아올 길이 없다.
     */
    private PetSaveResult create(Long memberId, PetSaveContent content) {
        LocalDateTime syncedAt = SyncTime.at(System.currentTimeMillis());

        try {
            petRepository.save(Pet.create(memberId, content, syncedAt));
            return new PetSaveResult.Saved(SyncTime.millis(syncedAt));
        } catch (DataIntegrityViolationException collision) {
            // 같은 회원의 두 요청이 나란히 "아직 없음"을 보고 둘 다 만들려 한 경우다.
            // uk_pet_member가 하나를 막는다. 막힌 쪽은 상대가 방금 올린 것을 읽어
            // 충돌로 돌려준다 — 여기서 덮어쓰면 상대의 진행이 사라진다.
            return petRepository.findByMemberId(memberId)
                    .<PetSaveResult>map(pet -> new PetSaveResult.Conflict(pet.snapshot()))
                    .orElseThrow(() -> collision);
        }
    }

    /**
     * 새 syncedAt은 반드시 지금 행에 든 값보다 커야 한다.
     *
     * 같은 밀리초 안에 두 저장이 일어나면 새 값이 옛 값과 같아지고, 그러면
     * 뒤이은 다른 기기의 저장이 옛 시각으로도 조건을 통과해 충돌이 검사를
     * 빠져나간다. 시계가 뒤로 조정되는 경우(NTP)도 같은 문제다.
     *
     * 여기서 쓰는 baseSyncedAt은 클라이언트가 고른 값이 아니다. 이 메서드는
     * 덮어쓰기 갈래에서만 부르고, 그 UPDATE는 {@code synced_at = baseSyncedAt}인
     * 행만 바꾼다 — 조건이 맞았다면 그 값은 곧 DB에 들어 있던 값이다. 그래서
     * base+1은 "DB 값 +1"이지 "클라이언트가 부른 값"이 아니다.
     */
    private long nextSyncedAt(long baseSyncedAt) {
        long now = System.currentTimeMillis();

        return now > baseSyncedAt ? now : baseSyncedAt + 1;
    }
}
