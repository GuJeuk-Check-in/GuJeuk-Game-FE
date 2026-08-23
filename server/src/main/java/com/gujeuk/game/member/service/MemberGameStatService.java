package com.gujeuk.game.member.service;

import com.gujeuk.game.member.domain.GameType;
import com.gujeuk.game.member.domain.MemberGameStat;
import com.gujeuk.game.member.domain.MemberGameStatRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 게임별 전적 행을 꺼낸다. 없으면 그때 만든다.
 *
 * 가입 시점에 모든 게임의 행을 미리 만들지 않는 이유는, 게임을 추가할 때마다
 * 기존 회원 전체를 훑는 마이그레이션이 따라붙기 때문이다. 처음 그 게임을 할 때
 * 만들면 그런 일이 없다.
 */
@Service
@RequiredArgsConstructor
public class MemberGameStatService {
    private final MemberGameStatRepository statRepository;

    @Transactional
    public MemberGameStat getOrCreate(Long memberId, GameType game) {
        return statRepository.findByMemberIdAndGame(memberId, game)
                .orElseGet(() -> create(memberId, game));
    }

    private MemberGameStat create(Long memberId, GameType game) {
        try {
            return statRepository.save(MemberGameStat.start(memberId, game));
        } catch (DataIntegrityViolationException collision) {
            // 같은 회원이 두 탭에서 동시에 접속하면 두 요청이 나란히 없음을 보고
            // 둘 다 만들려 한다. 유니크 제약이 하나를 막으므로 그때는 남의 것을 읽는다.
            return statRepository.findByMemberIdAndGame(memberId, game)
                    .orElseThrow(() -> collision);
        }
    }
}
