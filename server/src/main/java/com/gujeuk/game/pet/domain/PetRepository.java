package com.gujeuk.game.pet.domain;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Optional;

public interface PetRepository extends JpaRepository<Pet, Long> {

    Optional<Pet> findByMemberId(Long memberId);

    /**
     * 알고 있던 시각이 아직 그대로일 때만 덮어쓴다. 바뀐 행 수가 판정이다.
     *
     * 읽어서 비교한 뒤 저장하면 안 된다. 두 기기가 동시에 올리면 둘 다
     * "내가 아는 시각이 맞다"를 통과한 뒤 나중 것이 앞의 것을 덮어써서, 먼저
     * 올린 사람의 진행이 아무 경고 없이 사라진다. 조건을 건 UPDATE 한 방이면
     * 그 사이에 끼어들 틈이 없다 — 0행이 곧 충돌이다.
     *
     * 각 호출이 자기 트랜잭션에서 끝나게 리포지토리에 트랜잭션을 건다.
     * 서비스 전체를 한 트랜잭션으로 묶으면, MySQL의 기본 격리 수준(REPEATABLE
     * READ)에서 충돌 뒤 다시 읽은 값이 방금 다른 요청이 넣은 최신 값이 아니라
     * 트랜잭션 시작 시점의 스냅샷이 된다. 409에 옛 상태를 실어 보내면 사용자는
     * 무엇을 고르는지 모른 채 고르게 된다.
     */
    @Transactional
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update Pet p
            set p.name = :name,
                p.level = :level,
                p.exp = :exp,
                p.coins = :coins,
                p.saveVersion = :saveVersion,
                p.save = :save,
                p.syncedAt = :syncedAt
            where p.memberId = :memberId and p.syncedAt = :baseSyncedAt
            """)
    int updateIfUnchanged(
            @Param("memberId") Long memberId,
            @Param("baseSyncedAt") LocalDateTime baseSyncedAt,
            @Param("syncedAt") LocalDateTime syncedAt,
            @Param("name") String name,
            @Param("level") int level,
            @Param("exp") int exp,
            @Param("coins") int coins,
            @Param("saveVersion") int saveVersion,
            @Param("save") JsonNode save
    );

    /** 없어도 조용히 지나간다. DELETE는 멱등이어야 한다. */
    @Transactional
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("delete from Pet p where p.memberId = :memberId")
    int deleteByMemberId(@Param("memberId") Long memberId);
}
