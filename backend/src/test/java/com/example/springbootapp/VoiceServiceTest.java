package com.example.springbootapp;

import java.time.*;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import static org.assertj.core.api.Assertions.*;

class VoiceServiceTest {
    static class TestClock extends Clock {
        long now=100000;
        public ZoneId getZone(){return ZoneOffset.UTC;}
        public Clock withZone(ZoneId zone){return this;}
        public Instant instant(){return Instant.ofEpochMilli(now);}
    }
    final TestClock clock=new TestClock();
    final VoiceService voice=new VoiceService(clock);
    void peers() {
        voice.state("a@example.com","Alice","a");
        voice.state("b@example.com","Bob","b");
        voice.state("c@example.com","Carol","c");
    }
    @Test void callIsPrivateAndOnlyRecipientCanAnswer() {
        peers();
        var call=voice.start("a@example.com","a","b","offer");
        assertThat(voice.state("b@example.com","Bob","b").call().offer()).isEqualTo("offer");
        assertThat(voice.state("c@example.com","Carol","c").call()).isNull();
        assertThatThrownBy(()->voice.answer("a@example.com","a",call.id(),"answer")).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(()->voice.answer("c@example.com","c",call.id(),"answer")).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(()->voice.end("c@example.com","c",call.id())).isInstanceOf(ResponseStatusException.class);
        assertThat(voice.answer("b@example.com","b",call.id(),"answer").status()).isEqualTo("ACCEPTED");
        assertThat(voice.state("a@example.com","Alice","a").call().answer()).isEqualTo("answer");
        voice.end("a@example.com","a",call.id());
        assertThat(voice.state("b@example.com","Bob","b").call().status()).isEqualTo("ENDED");
        assertThat(voice.state("b@example.com","Bob","b").call().offer()).isNull();
    }
    @Test void busyAccountsCannotStartAnotherCallEvenInAnotherTab() {
        peers();
        voice.start("a@example.com","a","b","offer");
        voice.state("a@example.com","Alice","a2");
        assertThatThrownBy(()->voice.start("a@example.com","a2","c","offer")).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(()->voice.start("c@example.com","c","b","offer")).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(()->voice.state("c@example.com","Carol","a")).isInstanceOf(ResponseStatusException.class);
    }
    @Test void expiredInvitationsReleaseMembersAndCannotBeAccepted() {
        peers(); var call=voice.start("a@example.com","a","b","offer");
        clock.now+=61000;
        assertThat(voice.state("b@example.com","Bob","b").call().status()).isEqualTo("ENDED");
        assertThatThrownBy(()->voice.answer("b@example.com","b",call.id(),"answer")).isInstanceOf(ResponseStatusException.class);
        voice.state("a@example.com","Alice","a");
        assertThat(voice.start("a@example.com","a","b","new").status()).isEqualTo("RINGING");
    }
    @Test void newCallWinsOverEndedCallWithSameTimestamp() {
        peers(); var old=voice.start("a@example.com","a","b","old");
        voice.end("b@example.com","b",old.id());
        var fresh=voice.start("a@example.com","a","b","fresh");
        assertThat(voice.state("a@example.com","Alice","a").call().id()).isEqualTo(fresh.id());
    }
    @Test void leavingAndLogoutRemovePresenceAndEndCalls() {
        peers();
        var call=voice.start("a@example.com","a","b","offer");
        assertThatThrownBy(()->voice.leave("c@example.com","a")).isInstanceOf(ResponseStatusException.class);
        voice.leave("b@example.com","b");
        assertThat(voice.state("a@example.com","Alice","a").call().status()).isEqualTo("ENDED");
        assertThat(voice.state("a@example.com","Alice","a").members()).extracting(VoiceService.Member::id).doesNotContain("b");
        voice.state("b@example.com","Bob","b");
        voice.state("b@example.com","Bob","b2");
        voice.logout("b@example.com");
        assertThat(voice.state("a@example.com","Alice","a").members()).extracting(VoiceService.Member::id).doesNotContain("b","b2");
    }

    @Test void refreshedMemberUsesMostRecentTabAndClosedTabsExpire() {
        peers(); clock.now++;
        voice.state("b@example.com","Bob","refreshed");
        assertThat(voice.state("a@example.com","Alice","a").members()).extracting(VoiceService.Member::id)
                .contains("refreshed").doesNotContain("b");
        clock.now+=15001;
        assertThat(voice.state("a@example.com","Alice","a").members()).isEmpty();
    }

    @Test void vanishedPeersEndAcceptedCalls() {
        peers(); var call=voice.start("a@example.com","a","b","offer");
        voice.answer("b@example.com","b",call.id(),"answer");
        clock.now+=91000;
        assertThat(voice.state("a@example.com","Alice","a").call().status()).isEqualTo("ENDED");
        assertThatThrownBy(()->voice.start("a@example.com","a","b","offer")).isInstanceOf(ResponseStatusException.class);
    }
}
