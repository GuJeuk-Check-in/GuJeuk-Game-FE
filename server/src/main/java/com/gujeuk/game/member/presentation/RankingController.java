package com.gujeuk.game.member.presentation;

import com.gujeuk.game.member.presentation.dto.RankingEntry;
import com.gujeuk.game.member.service.QueryRankingService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequiredArgsConstructor
public class RankingController {
    private final QueryRankingService queryRankingService;

    @GetMapping("/ranking")
    public List<RankingEntry> ranking() {
        return queryRankingService.execute();
    }
}
