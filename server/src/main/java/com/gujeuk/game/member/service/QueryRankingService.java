package com.gujeuk.game.member.service;

import com.gujeuk.game.member.domain.GameType;
import com.gujeuk.game.member.domain.MemberGameStatRepository;
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

    private final MemberGameStatRepository statRepository;

    /** 게임 하나의 랭킹. 게임마다 레이팅이 따로라 어느 게임인지 반드시 받아야 한다. */
    @Transactional(readOnly = true)
    public List<RankingEntry> execute(GameType game) {
        var rows = statRepository.findRanking(game, PageRequest.of(0, LIMIT));

        return IntStream.range(0, rows.size())
                .mapToObj(index -> RankingEntry.of(index + 1, rows.get(index)))
                .toList();
    }
}
