package com.gujeuk.game.pet.presentation;

import com.gujeuk.game.global.error.GameException;
import com.gujeuk.game.pet.presentation.dto.PetConflictResponse;
import com.gujeuk.game.pet.presentation.dto.PetResponse;
import com.gujeuk.game.pet.presentation.dto.PetSyncRequest;
import com.gujeuk.game.pet.presentation.dto.PetSyncResponse;
import com.gujeuk.game.pet.service.PetSaveResult;
import com.gujeuk.game.pet.service.PetService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 펫 세이브 백업.
 *
 * 세 엔드포인트 모두 인증이 필요하다({@code SecurityConfig}의 permitAll
 * 목록에 넣지 않는다). 주인은 언제나 토큰이 정한다 — JwtFilter가
 * principal에 넣어 둔 memberId다. 요청 본문이나 파라미터로 회원을 받으면, 한
 * 기기를 여러 사람이 번갈아 쓰는 환경에서 남의 펫을 읽고 덮어쓸 수 있게 된다.
 */
@RestController
@RequestMapping("/pet")
@RequiredArgsConstructor
public class PetController {

    private final PetService petService;

    /**
     * 서버에 있는 세이브를 가져온다.
     *
     * 없으면 404다. 에러라기보다 방금 연결한 사람의 정상 상태이고, 클라이언트는
     * 이것을 "새로 시작"으로 읽는다.
     */
    @GetMapping
    public PetResponse get(@AuthenticationPrincipal Long memberId) {
        return petService.find(memberId)
                .map(PetResponse::from)
                .orElseThrow(() -> GameException.notFound("저장된 펫이 없습니다."));
    }

    /**
     * 세이브를 통째로 올린다.
     *
     * 충돌(409)은 예외로 던지지 않고 여기서 직접 응답을 만든다. 공통 핸들러는
     * {@code {"message": ...}}만 내는데, 충돌 응답에는 서버 상태가 함께 실려야
     * 하기 때문이다. 그 한 경우 때문에 모든 에러의 모양을 바꾸지 않는다.
     */
    @PutMapping
    public ResponseEntity<Object> put(
            @AuthenticationPrincipal Long memberId,
            @RequestBody PetSyncRequest request
    ) {
        PetSaveResult result = petService.save(memberId, request.save(), request.baseSyncedAt());

        if (result instanceof PetSaveResult.Saved saved) {
            return ResponseEntity.ok(new PetSyncResponse(saved.syncedAt()));
        }

        PetSaveResult.Conflict conflict = (PetSaveResult.Conflict) result;

        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(PetConflictResponse.of(conflict.server()));
    }

    /**
     * 서버에 남은 내 펫을 지운다.
     *
     * 연결을 끊는 것 자체는 토큰을 버리면 끝이지만, 서버에 남은 자기 데이터를
     * 지울 방법이 없으면 안 된다. 없어도 204다(멱등) — 지우기를 두 번 눌렀다고
     * 에러를 보여줄 이유가 없다.
     */
    @DeleteMapping
    public ResponseEntity<Void> delete(@AuthenticationPrincipal Long memberId) {
        petService.delete(memberId);

        return ResponseEntity.noContent().build();
    }
}
