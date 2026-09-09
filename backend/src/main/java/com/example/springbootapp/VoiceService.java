package com.example.springbootapp;

import java.time.Clock;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@Service
public class VoiceService {
    private final Map<String, Peer> peers = new HashMap<>();
    private final Map<String, Call> calls = new HashMap<>();
    private final Clock clock;
    public VoiceService() { this(Clock.systemUTC()); }
    VoiceService(Clock clock) { this.clock = clock; }
    private static class Peer {
        String id, email, name, memberId;
        long seen;
        Peer(String id, String email, String name, long seen) { this.id=id; this.email=email; this.name=name; this.seen=seen; }
    }
    private static class Call {
        String id=UUID.randomUUID().toString(), offer, answer, status="RINGING";
        Peer caller, callee;
        long created, changed;
        Call(Peer caller, Peer callee, String offer, long now) {
            this.caller=caller; this.callee=callee; this.offer=offer; created=changed=now;
        }
    }
    public record Member(String id, String name, boolean busy, String memberId) {}
    public record CallView(String id, String otherName, boolean outgoing, String status, String offer, String answer) {}
    public record State(List<Member> members, CallView call) {}

    public synchronized State state(String email, String name, String clientId) {
        return state(email, name, clientId, null);
    }
    public synchronized State state(String email, String name, String clientId, String memberId) {
        clean();
        Peer self=peers.get(clientId);
        if (self != null && !self.email.equals(email)) throw error(HttpStatus.FORBIDDEN, "Invalid call session.");
        if (self == null) { self=new Peer(clientId,email,name,clock.millis()); peers.put(clientId,self); }
        self.name=name; self.memberId=memberId; self.seen=clock.millis();
        // Prefer the most recently seen tab so a refresh does not leave a stale call target.
        var available=new HashMap<String,Peer>();
        for (Peer peer : peers.values()) {
            if (!peer.email.equals(email) && clock.millis()-peer.seen < 15000) {
                available.merge(peer.email,peer,(first,second)->first.seen>=second.seen?first:second);
            }
        }
        var members=available.values().stream().map(p -> new Member(p.id,p.name,busy(p.email),p.memberId))
                .sorted(Comparator.comparing(Member::name)).toList();
        Call current=calls.values().stream().filter(c -> c.caller.id.equals(clientId) || c.callee.id.equals(clientId))
                .max(Comparator.<Call, Boolean>comparing(c -> !c.status.equals("ENDED")).thenComparingLong(c -> c.created)).orElse(null);
        return new State(members,current==null ? null : view(current,clientId));
    }
    public synchronized CallView start(String email, String clientId, String targetId, String offer) {
        clean();
        Peer caller=own(email,clientId), callee=peers.get(targetId);
        if (callee==null || clock.millis()-callee.seen>=15000) throw error(HttpStatus.CONFLICT,"This member is no longer available.");
        if (callee.email.equals(email)) throw error(HttpStatus.BAD_REQUEST,"Choose another member.");
        if (busy(email) || busy(callee.email)) throw error(HttpStatus.CONFLICT,"One of you is already in a call.");
        var call=new Call(caller,callee,offer,clock.millis()); calls.put(call.id,call);
        return view(call,clientId);
    }
    public synchronized CallView answer(String email, String clientId, String id, String answer) {
        clean(); Call call=participating(email,clientId,id);
        if (!call.callee.id.equals(clientId)) throw error(HttpStatus.FORBIDDEN,"Only the invited member can accept.");
        if (!call.status.equals("RINGING")) throw error(HttpStatus.CONFLICT,"This invitation is no longer active.");
        call.answer=answer; call.status="ACCEPTED"; call.changed=clock.millis();
        return view(call,clientId);
    }
    public synchronized void end(String email, String clientId, String id) {
        clean(); Call call=participating(email,clientId,id);
        call.status="ENDED"; call.changed=clock.millis(); call.offer=null; call.answer=null;
    }
    public synchronized void leave(String email, String clientId) {
        Peer peer=peers.get(clientId);
        if (peer == null) return;
        own(email,clientId);
        disconnect(peer);
    }
    public synchronized void logout(String email) {
        for (Peer peer : new ArrayList<>(peers.values())) {
            if (peer.email.equals(email)) disconnect(peer);
        }
    }
    private void disconnect(Peer peer) {
        for (Call call : calls.values()) {
            if (call.caller.id.equals(peer.id) || call.callee.id.equals(peer.id)) {
                call.status="ENDED"; call.changed=clock.millis(); call.offer=null; call.answer=null;
            }
        }
        peers.remove(peer.id);
    }

    private Peer own(String email, String clientId) {
        Peer peer=peers.get(clientId);
        if (peer==null || !peer.email.equals(email)) throw error(HttpStatus.FORBIDDEN,"Open the Voice Call page again.");
        return peer;
    }
    private Call participating(String email,String clientId,String id) {
        own(email,clientId); Call call=calls.get(id);
        if (call==null) throw error(HttpStatus.NOT_FOUND,"Call has ended.");
        if (!call.caller.id.equals(clientId) && !call.callee.id.equals(clientId)) throw error(HttpStatus.FORBIDDEN,"This call is private.");
        return call;
    }
    private boolean busy(String email) {
        return calls.values().stream().anyMatch(c -> !c.status.equals("ENDED") && (c.caller.email.equals(email)||c.callee.email.equals(email)));
    }
    private CallView view(Call call,String clientId) {
        boolean outgoing=call.caller.id.equals(clientId);
        return new CallView(call.id,outgoing?call.callee.name:call.caller.name,outgoing,call.status,call.offer,call.answer);
    }
    private void clean() {
        long now=clock.millis();
        for(Call call:calls.values()) {
            if (!call.status.equals("ENDED") && (now-call.caller.seen>90000 || now-call.callee.seen>90000
                    || (call.status.equals("RINGING") && now-call.created>60000))) {
                call.status="ENDED"; call.changed=now; call.offer=null; call.answer=null;
            }
        }
        calls.values().removeIf(c -> c.status.equals("ENDED") && now-c.changed>60000);
        peers.values().removeIf(p -> now-p.seen>180000);
    }
    private ResponseStatusException error(HttpStatus status,String message) { return new ResponseStatusException(status,message); }
}
