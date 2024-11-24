const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 3000, host: '0.0.0.0' });

let players = [];
let maxPlayers = 5;
let votes = {};
let gamePhase = "day";
let rolesAssigned = false;
let timer = null;

function assignRoles() {
    const shuffledPlayers = [...players];
    shuffledPlayers.sort(() => 0.5 - Math.random());
    shuffledPlayers[0].role = "mafia";
    shuffledPlayers.slice(1).forEach(player => player.role = "citizen");
    rolesAssigned = true;

    players.forEach(player => {
        player.ws.send(JSON.stringify({ type: "role", role: player.role, message: `Your role is ${player.role}` }));
    });
}

function switchPhase() {
    gamePhase = gamePhase === "day" ? "night" : "day";
    broadcast({ type: "status", message: `It is now ${gamePhase}.` });
    startTimer();
}


function startTimer() {
    clearInterval(timer);
    let timeLeft = 30;  // 30초 타이머 설정
    broadcast({ type: "timer", timeLeft });

    timer = setInterval(() => {
        timeLeft--;
        broadcast({ type: "timer", timeLeft });

        if (timeLeft <= 0) {
            clearInterval(timer);
            if (gamePhase === "day") {
                handleDayVote();
            } else if (gamePhase === "night") {
                handleNightAction();
            }
            switchPhase();
        }
    }, 1000);
}


function handleDayVote() {
    const voteCounts = {};
    Object.values(votes).forEach(vote => voteCounts[vote] = (voteCounts[vote] || 0) + 1);
    const eliminated = Object.entries(voteCounts).reduce((a, b) => (a[1] > b[1] ? a : b), [])[0];
    
    if (eliminated) {
        const player = players.find(p => p.playerId === eliminated);
        if (player) {
            player.alive = false;
            player.ws.close();
            broadcast({ type: "status", message: `${player.playerId} has been eliminated by vote.` });
        }
    }
    votes = {};
}

function handleNightAction() {
    const mafiaVote = Object.values(votes)[0];
    const target = players.find(p => p.playerId === mafiaVote);
    if (target) {
        target.alive = false;
        target.ws.close();
        broadcast({ type: "status", message: `${target.playerId} was eliminated by the mafia.` });
    }
    votes = {};
}

function broadcast(data) {
    players.forEach(player => player.ws.send(JSON.stringify(data)));
}

function broadcastPlayerList() {
    const playerList = players.filter(p => p.alive).map(player => player.playerId).join(", ");
    broadcast({ type: "playerList", message: `Alive players: ${playerList}` });
}
function checkGameEnd() {
    const aliveMafia = players.filter(player => player.role === "mafia" && player.alive).length;
    const aliveCitizens = players.filter(player => player.role === "citizen" && player.alive).length;

    if (aliveMafia === 1 && aliveCitizens === 0) {
        broadcast({ type: "status", message: "Mafia wins!" });
        endGame();
    } else if (aliveMafia === 0) {
        broadcast({ type: "status", message: "Citizens win!" });
        endGame();
    }
}

function endGame() {
    broadcast({ type: "status", message: "Game Over!" });
    // 게임을 종료하는 추가 로직을 추가할 수 있습니다.
}

wss.on('connection', (ws) => {
    console.log("New client connected.");

    if (players.length >= maxPlayers) {
        ws.send(JSON.stringify({ type: "error", message: "Game is full" }));
        ws.close();
        return;
    }

    ws.on('message', (message) => {
        const data = JSON.parse(message);
        console.log(`Received message from ${data.nickname}:`, data);

        if (data.type === "setNickname") {
            const playerId = data.nickname;
            players.push({ ws, playerId, role: null, alive: true });
            ws.send(JSON.stringify({ type: "welcome", message: `Welcome ${playerId}!` }));
            broadcastPlayerList();

            if (players.length === maxPlayers && !rolesAssigned) {
                console.log("All players connected. Assigning roles and starting the game...");
                assignRoles(); // 게임 시작
                startTimer();
            }
        }

       // 투표 처리
if (data.type === "vote" && gamePhase === "day") {
    votes[data.voter] = data.target;
    broadcast({ type: "vote", message: `${data.voter} voted for ${data.target}` });
}

// 마피아 투표 (밤에만)
if (data.type === "mafiaVote" && gamePhase === "night") {
    votes[data.voter] = data.target;
}

// 채팅 메시지 처리
if (data.type === "chat") {
    broadcast({ type: "chat", message: `${data.nickname}: ${data.message}` });
}

    });

    ws.on('close', () => {
        console.log("Client disconnected.");
        players = players.filter(player => player.ws !== ws);
        broadcastPlayerList();
    });
});


console.log("WebSocket server is running on ws://0.0.0.0:3000");
