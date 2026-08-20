package com.gujeuk.game.member.service;

import com.gujeuk.game.member.domain.MemberRepository;
import com.gujeuk.game.member.presentation.dto.RankingEntry;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.IntStream;

@Service
@RequiredArgsConstructor
public class QueryRankingService {
    private static final int LIMIT = 50;

    private final MemberRepository memberRepository;

    @Transactional(readOnly = true)
    public List<RankingEntry> execute() {
        var members = memberRepository.findAllByOrderByRatingDescIdAsc(PageRequest.of(0, LIMIT));

        return IntStream.range(0, members.size())
                .mapToObj(index -> RankingEntry.of(index + 1, members.get(index)))
                .toList();
    }
}
