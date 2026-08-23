package com.gujeuk.game.member.presentation;

import com.gujeuk.game.member.domain.GameType;
import com.gujeuk.game.member.presentation.dto.RankingEntry;
import com.gujeuk.game.member.service.QueryRankingService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequiredArgsConstructor
public class RankingController {
    private final QueryRankingService queryRankingService;

    /**
     * 게임별 랭킹.
     *
     * game은 필수다. 기본값을 두면 어느 게임 랭킹을 보고 있는지 모른 채
     * 엉뚱한 목록을 띄우게 된다.
     */
    @GetMapping("/ranking")
    public List<RankingEntry> ranking(@RequestParam GameType game) {
        return queryRankingService.execute(game);
    }
}
