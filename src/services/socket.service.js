import ChatMessage from "../models/ChatMessage.js";
import Word from "../models/Word.js";
import { markOnline, markOffline } from "../controllers/ranking.controller.js";

// userId map: socketId → userId
const socketUserMap = new Map();
const rooms = new Map(); // Store room info: { id, name, players: [], status: 'waiting'|'playing', words: [], currentTurn: 0 }

export const setupSocket = (io) => {
    io.on("connection", async (socket) => {
        console.log("⚡ User connected:", socket.id);

        // Track online time: client sends userId after connecting
        socket.on("user_online", async (userId) => {
            if (userId) {
                socketUserMap.set(socket.id, userId);
                await markOnline(userId);
                // Broadcast online status update
                io.emit("online_status_changed", { userId, isOnline: true });
            }
        });

        // --- CHAT LOGIC ---
        try {
            const history = await ChatMessage.find().sort({ timestamp: -1 }).limit(15).lean();
            socket.emit("chat_history", history.reverse());
        } catch (err) {
            console.error("Error loading chat history:", err);
        }

        socket.on("load_more_history", async (skip) => {
            try {
                const older = await ChatMessage.find().sort({ timestamp: -1 }).skip(skip).limit(15).lean();
                socket.emit("older_messages", older.reverse());
            } catch (err) {
                console.error("Error loading older messages:", err);
            }
        });

        socket.on("send_message", async (data) => {
            try {
                const newMsg = await ChatMessage.create({
                    userId: data.userId,
                    sender: data.sender,
                    picture: data.picture,
                    text: data.text,
                    isAdmin: data.isAdmin || false,
                    replyTo: data.replyTo || null,
                });
                io.emit("receive_message", newMsg);
            } catch (err) {
                console.error("Error saving message:", err);
            }
        });

        // --- GAME LOGIC ---

        // 1. Get Room List
        socket.on("game_get_rooms", () => {
            const roomList = Array.from(rooms.values()).map(r => ({
                id: r.id,
                name: r.name,
                playerCount: r.players.length,
                status: r.status,
                isPrivate: r.isPrivate
            }));
            socket.emit("game_room_list", roomList);
        });

        // 2. Create Room
        socket.on("game_create_room", ({ roomName, user, password }) => {
            const roomId = `room_${Date.now()}`;
            const newRoom = {
                id: roomId,
                name: roomName,
                password: password || null,
                isPrivate: !!password,
                players: [{ ...user, socketId: socket.id, cards: [], score: 0 }],
                status: "waiting",
                words: [],
                currentTurn: 0,
                scores: { [socket.id]: 0 }
            };
            rooms.set(roomId, newRoom);
            socket.join(roomId);
            socket.emit("game_room_updated", newRoom);
            // Broadcast update to everyone in lobby
            io.emit("game_room_list", getActiveRooms());
        });

        // 3. Join Room
        socket.on("game_join_room", async ({ roomId, user, password }) => {
            const room = rooms.get(roomId);
            if (!room) return socket.emit("game_error", "Phòng không tồn tại");
            if (room.players.length >= 2) return socket.emit("game_error", "Phòng đã đầy");
            if (room.isPrivate && room.password !== password) return socket.emit("game_error", "Mật khẩu không chính xác");

            const player = { ...user, socketId: socket.id, cards: [], score: 0 };
            room.players.push(player);
            room.scores[socket.id] = 0;
            socket.join(roomId);

            io.to(roomId).emit("game_room_updated", room);
            io.emit("game_room_list", getActiveRooms());

            if (room.players.length === 2) {
                await startMatch(roomId, io);
            }
        });

        // 4. Challenger Picks a Card
        socket.on("game_pick_card", ({ roomId, wordId }) => {
            const room = rooms.get(roomId);
            if (!room || room.status !== "playing" || room.phase !== "picking") return;

            const challenger = room.players[room.currentTurn];
            if (challenger.socketId !== socket.id) return;

            const word = challenger.cards.find(w => w._id.toString() === wordId);
            if (!word) return;

            room.activeWord = word;
            room.phase = "answering";
            
            const hint = word.english.split(' ').map(w => '_'.repeat(w.length)).join('   ');
            
            io.to(roomId).emit("game_card_picked", {
                word: { _id: word._id, vietnamese: word.vietnamese, hint },
                challengerId: socket.id,
                phase: "answering"
            });
        });

        // 5. Opponent Submits Answer
        socket.on("game_submit_answer", ({ roomId, answer }) => {
            const room = rooms.get(roomId);
            if (!room || room.status !== "playing" || room.phase !== "answering") return;

            const answererIdx = (room.currentTurn + 1) % 2;
            const answerer = room.players[answererIdx];
            if (answerer.socketId !== socket.id) return; // Only opponent can answer

            const word = room.activeWord;
            const isCorrect = word.english.toLowerCase().trim() === answer.toLowerCase().trim();
            
            if (isCorrect) {
                room.scores[socket.id] += 1;
            } else {
                room.scores[socket.id] -= 1;
            }

            // Remove card from challenger's hand
            const challenger = room.players[room.currentTurn];
            challenger.cards = challenger.cards.filter(c => c._id.toString() !== word._id.toString());

            // Switch roles & Reset phase
            room.currentTurn = (room.currentTurn + 1) % 2;
            room.phase = "picking";
            room.activeWord = null;

            const allCardsPlayed = room.players.every(p => p.cards.length === 0);
            if (allCardsPlayed) {
                room.status = "finished";
                io.to(roomId).emit("game_finished", { scores: room.scores, players: room.players });
                setTimeout(() => rooms.delete(roomId), 5000);
            } else {
                io.to(roomId).emit("game_turn_update", {
                    scores: room.scores,
                    currentTurn: room.currentTurn,
                    phase: "picking",
                    lastResult: { socketId: socket.id, isCorrect, correctMeaning: word.english },
                    players: room.players
                });
            }
        });

        // 6. Leave Room
        socket.on("game_leave_room", ({ roomId }) => {
            const room = rooms.get(roomId);
            if (!room) return;
            const playerIdx = room.players.findIndex(p => p.socketId === socket.id);
            if (playerIdx !== -1) {
                room.players.splice(playerIdx, 1);
                socket.leave(roomId);
                if (room.players.length === 0) {
                    rooms.delete(roomId);
                } else {
                    room.status = "waiting";
                    io.to(roomId).emit("game_player_left", socket.id);
                }
                io.emit("game_room_list", getActiveRooms());
            }
        });

        socket.on("disconnect", async () => {
            console.log("🔥 User disconnected:", socket.id);

            // Track offline time
            const userId = socketUserMap.get(socket.id);
            if (userId) {
                socketUserMap.delete(socket.id);
                await markOffline(userId);
                // Broadcast offline status
                io.emit("online_status_changed", { userId, isOnline: false });
            }

            // Handle leaving room on disconnect
            rooms.forEach((room, roomId) => {
                const playerIdx = room.players.findIndex(p => p.socketId === socket.id);
                if (playerIdx !== -1) {
                    room.players.splice(playerIdx, 1);
                    if (room.players.length === 0) {
                        rooms.delete(roomId);
                    } else {
                        room.status = "waiting";
                        io.to(roomId).emit("game_player_left", socket.id);
                    }
                    io.emit("game_room_list", getActiveRooms());
                }
            });
        });
    });
};

const getActiveRooms = () => {
    return Array.from(rooms.values()).map(r => ({
        id: r.id,
        name: r.name,
        playerCount: r.players.length,
        status: r.status,
        isPrivate: r.isPrivate
    }));
};

const startMatch = async (roomId, io) => {
    const room = rooms.get(roomId);
    if (!room) return;

    try {
        // Fetch 10 random words
        const words = await Word.aggregate([{ $sample: { size: 10 } }]);
        if (words.length < 10) {
            return io.to(roomId).emit("game_error", "Không đủ từ vựng để bắt đầu game (cần tối thiểu 10 từ)");
        }

        room.words = words;
        room.status = "playing";
        room.phase = "picking"; // Start with picking phase
        room.currentTurn = 0;

        // Deal 5 cards to each player
        room.players[0].cards = words.slice(0, 5);
        room.players[1].cards = words.slice(5, 10);

        io.to(roomId).emit("game_started", {
            players: room.players,
            currentTurn: room.currentTurn,
            phase: room.phase
        });
    } catch (err) {
        console.error("Start match error:", err);
    }
};
