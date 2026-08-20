package com.gujeuk.game.member.domain;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface MemberRepository extends JpaRepository<Member, Long> {
    Optional<Member> findByNickname(String nickname);

    boolean existsByNickname(String nickname);

    List<Member> findAllByOrderByRatingDescIdAsc(Pageable pageable);
}
