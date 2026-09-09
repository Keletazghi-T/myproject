package com.example.springbootapp;

import java.util.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/voice")
public class VoiceController {
    private final CurrentAccount accounts;
    private final DatabaseService database;
    private final VoiceService voice;
    private final String stun, turn, username, credential;
    public VoiceController(CurrentAccount accounts, VoiceService voice, DatabaseService database,
            @Value("${voice.stun-url:stun:stun.l.google.com:19302}") String stun,
            @Value("${voice.turn-url:}") String turn, @Value("${voice.turn-username:}") String username,
            @Value("${voice.turn-credential:}") String credential) {
        this.database=database;this.accounts=accounts;this.voice=voice;this.stun=stun;this.turn=turn;this.username=username;this.credential=credential;
    }
    @GetMapping("/config")
    public Map<String,Object> config(Authentication auth) {
        accounts.require(auth);
        List<Map<String,String>> servers=new ArrayList<>();
        if(!stun.isBlank()) servers.add(Map.of("urls",stun));
        if(!turn.isBlank()&&!username.isBlank()&&!credential.isBlank()) servers.add(Map.of("urls",turn,"username",username,"credential",credential));
        return Map.of("iceServers",servers);
    }
    @GetMapping("/state")
    public VoiceService.State state(@RequestParam UUID clientId, Authentication auth) {
        var account=accounts.require(auth);
        return voice.state(account.email(),account.name(),clientId.toString(),database.memberId(account.email()));
    }
    @PostMapping("/leave")
    public void leave(@Valid @RequestBody End request, Authentication auth) {
        voice.leave(accounts.require(auth).email(),request.clientId().toString());
    }
    @PostMapping("/calls")
    public VoiceService.CallView start(@Valid @RequestBody Start request, Authentication auth) {
        return voice.start(accounts.require(auth).email(),request.clientId().toString(),request.targetId().toString(),request.offer());
    }
    @PostMapping("/calls/{id}/answer")
    public VoiceService.CallView answer(@PathVariable UUID id,@Valid @RequestBody Answer request,Authentication auth) {
        return voice.answer(accounts.require(auth).email(),request.clientId().toString(),id.toString(),request.answer());
    }
    @PostMapping("/calls/{id}/end")
    public void end(@PathVariable UUID id,@Valid @RequestBody End request,Authentication auth) {
        voice.end(accounts.require(auth).email(),request.clientId().toString(),id.toString());
    }
    public record Start(@NotNull UUID clientId,@NotNull UUID targetId,@NotBlank @Size(max=65536) String offer) {}
    public record Answer(@NotNull UUID clientId,@NotBlank @Size(max=65536) String answer) {}
    public record End(@NotNull UUID clientId) {}
}
