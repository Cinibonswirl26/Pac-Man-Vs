package pacvs.app;

import fi.iki.elonen.NanoWSD;

import java.io.IOException;
import java.io.InputStream;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/** The phone's own web server while it hosts a game: the page files for friends on the Wi-Fi, and their WebSocket
 *  connections relayed into the page, where the room server (shared/hub.js) runs. No game logic lives here, so a
 *  room hosted from a phone plays by exactly the code a PC hosts with. Plain Java: it is also run on a desktop for
 *  its tests. */
public class HostServer extends NanoWSD {
    /** Where the page files come from: the app's assets, or a folder on a desktop. */
    public interface Files { InputStream open(String path) throws IOException; }
    /** The page's hub: a visitor arrived, said something, or left. Called on the server's own threads. */
    public interface Hub { void open(int id); void message(int id, String text); void close(int id); }

    private static final int MAX_MESSAGE = 2048;   // as the Node server's maxPayload
    private final Files files;
    private final Hub hub;
    private final Map<Integer, Visitor> visitors = new ConcurrentHashMap<>();
    private final AtomicInteger ids = new AtomicInteger();

    public HostServer(int port, Files files, Hub hub) { super(port); this.files = files; this.hub = hub; }

    /** Listen. No read timeout: a visitor waiting in the lobby may say nothing for a long while. */
    public void begin() throws IOException { start(0, false); }
    /** Stop listening and drop every visitor. */
    public void end() { for (Visitor v : visitors.values()) drop(v); stop(); }

    /** Text to one visitor, from the page. */
    public void send(int id, String text) {
        Visitor v = visitors.get(id);
        if (v == null) return;
        try { v.send(text); } catch (IOException e) { drop(v); }
    }
    public void close(int id) { Visitor v = visitors.get(id); if (v != null) drop(v); }
    private static void drop(Visitor v) { try { v.close(WebSocketFrame.CloseCode.NormalClosure, "bye", false); } catch (IOException e) { /* already gone */ } }

    @Override protected WebSocket openWebSocket(IHTTPSession session) { return new Visitor(session); }

    /** The page files, by the same paths the Node server serves them at. */
    @Override protected Response serveHttp(IHTTPSession session) {
        String uri = session.getUri() == null ? "" : session.getUri();
        String path = uri.equals("/") || uri.isEmpty() ? "client/index.html" : uri.equals("/soundlab") ? "client/soundlab.html"
            : (uri.startsWith("/client/") || uri.startsWith("/shared/")) && !uri.contains("..") ? uri.substring(1) : null;
        if (path == null) return plain(Response.Status.NOT_FOUND, "not found");
        InputStream in;
        try { in = files.open(path); } catch (IOException e) { return plain(Response.Status.NOT_FOUND, "not found"); }
        Response r = newChunkedResponse(Response.Status.OK, mime(path.substring(path.lastIndexOf('.') + 1)), in);
        r.addHeader("Cache-Control", "no-cache");
        r.addHeader("Connection", "close");   // one request per connection, so no thread sits waiting on an idle browser
        return r;
    }
    private static String mime(String ext) {
        switch (ext) {
            case "html": return "text/html";
            case "js": return "text/javascript";
            case "css": return "text/css";
            case "json": return "application/json";
            case "png": return "image/png";
            case "svg": return "image/svg+xml";
            default: return "application/octet-stream";
        }
    }
    private static Response plain(Response.Status status, String text) {
        Response r = newFixedLengthResponse(status, "text/plain", text);
        r.addHeader("Connection", "close");
        return r;
    }

    /** One WebSocket visitor, known to the page by its number. */
    private class Visitor extends WebSocket {
        final int id = ids.incrementAndGet();
        Visitor(IHTTPSession session) { super(session); }
        @Override protected void onOpen() { visitors.put(id, this); hub.open(id); }
        @Override protected void onMessage(WebSocketFrame frame) {
            if (frame.getOpCode() != WebSocketFrame.OpCode.Text) return;
            String text = frame.getTextPayload();
            if (text != null && text.length() <= MAX_MESSAGE) hub.message(id, text);
        }
        @Override protected void onClose(WebSocketFrame.CloseCode code, String reason, boolean byRemote) { if (visitors.remove(id) != null) hub.close(id); }
        @Override protected void onPong(WebSocketFrame frame) { }
        @Override protected void onException(IOException e) { }
    }
}
