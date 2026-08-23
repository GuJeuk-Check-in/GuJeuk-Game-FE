package com.gujeuk.game.member.domain;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface MemberGameStatRepository extends JpaRepository<MemberGameStat, Long> {
    Optional<MemberGameStat> findByMemberIdAndGame(Long memberId, GameType game);

    /**
     * 게임 하나의 랭킹.
     *
     * 전적과 닉네임이 다른 테이블이라 조인해서 가져온다. 레이팅이 같으면
     * memberId 오름차순으로 끊는다 — 순서가 매 조회마다 바뀌면 목록이 흔들린다.
     */
    @Query("""
            select new com.gujeuk.game.member.domain.RankingRow(m.nickname, s.rating, s.wins, s.losses)
            from MemberGameStat s, Member m
            where s.memberId = m.id and s.game = :game
            order by s.rating desc, s.memberId asc
            """)
    List<RankingRow> findRanking(@Param("game") GameType game, Pageable pageable);
}
