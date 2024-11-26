const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 3000, host: '0.0.0.0' });

let players = [];
let maxPlayers = 5;
let votes = {};
let voters = []; // 투표한 플레이어 추적
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

        // 마피아에게만 추가 행동 요청
        if (player.role === "mafia") {
            player.ws.send(JSON.stringify({ type: "action", message: "You can kill a player at night.", action: "kill" }));
        }
    });
}

function switchPhase() {
    gamePhase = gamePhase === "day" ? "night" : "day";
    voters = []; // 새 단계 시작 시 투표자 목록 초기화
    broadcast({ type: "status", message: `It is now ${gamePhase}.` });
    startTimer();
}

function startTimer() {
    clearInterval(timer);
    let timeLeft = 30; // 30초 타이머 설정
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
    const alivePlayers = players.filter(player => player.alive);
    const voteCounts = {};

    // 투표 결과 집계
    Object.values(votes).forEach(vote => {
        voteCounts[vote] = (voteCounts[vote] || 0) + 1;
    });

    const sortedVotes = Object.entries(voteCounts).sort((a, b) => b[1] - a[1]);

    if (sortedVotes.length === 0) {
        broadcast({ type: "status", message: "No votes were cast. Moving to the night phase." });
        votes = {};
        return;
    }

    if (sortedVotes.length > 1 && sortedVotes[0][1] === sortedVotes[1][1]) {
        broadcast({ type: "status", message: "Vote is tied. Moving to the night phase." });
    } else {
        const eliminated = sortedVotes[0][0];
        const player = alivePlayers.find(p => p.playerId === eliminated);

        if (player) {
            player.alive = false;
            player.ws.send(JSON.stringify({ type: "eliminated", message: "You are eliminated" }));
            player.ws.close();
            broadcast({ type: "status", message: `${player.playerId} has been eliminated by vote.` });
        }
    }
    votes = {};
    checkGameEnd();
}

function handleNightAction() {
    if (gamePhase === "night") {
        const mafia = players.find(player => player.role === "mafia" && player.alive);
        if (!mafia) return;

        mafia.ws.send(JSON.stringify({
            type: "action",
            message: "Who would you like to kill?",
            options: players.filter(p => p.alive && p.role !== "mafia").map(p => p.playerId)
        }));

        const nightTimer = setTimeout(() => {
            if (Object.keys(votes).length > 0) {
                const targetId = Object.values(votes)[0];
                const target = players.find(p => p.playerId === targetId);
                if (target) {
                    target.alive = false;
                    target.ws.send(JSON.stringify({ type: "eliminated", message: "You are eliminated" }));
                    target.ws.close();
                    broadcast({ type: "status", message: `${target.playerId} was eliminated by the mafia.` });
                }
            } else {
                broadcast({ type: "status", message: "No one was eliminated during the night." });
            }
            votes = {};
            switchPhase();
        }, 30000); // 30초 타이머
    }
}

function checkGameEnd() {
    const aliveMafia = players.filter(player => player.role === "mafia" && player.alive).length;
    const aliveCitizens = players.filter(player => player.role === "citizen" && player.alive).length;

    if (aliveMafia === 0) {
        broadcast({ type: "gameEnd", winner: "Citizens", message: "Citizens win! The mafia has been eliminated." });
        endGame("Citizens");
    } else if (aliveMafia >= aliveCitizens) {
        broadcast({ type: "gameEnd", winner: "Mafia", message: "Mafia wins! They outnumber the citizens." });
        endGame("Mafia");
    }
}

function endGame(winner) {
    broadcast({ type: "status", message: `Game Over! The ${winner} team wins!` });
    players.forEach(player => {
        if (player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(JSON.stringify({
                type: "gameOver",
                winner: winner,
                message: `Game Over! The ${winner} team wins!`
            }));
        }
        player.ws.close();
    });
    players = [];
    votes = {};
    rolesAssigned = false;
    gamePhase = "day";
    clearInterval(timer); // 타이머 초기화
}

function broadcast(data) {
    players.forEach(player => {
        if (player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(JSON.stringify(data));
        }
    });
}

function broadcastPlayerList() {
    const playerList = players.filter(p => p.alive).map(player => player.playerId).join(", ");
    broadcast({ type: "playerList", message: `Alive players: ${playerList}` });
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

        if (data.type === "setNickname") {
            const playerId = data.nickname;
            players.push({ ws, playerId, role: null, alive: true });
            ws.send(JSON.stringify({ type: "welcome", message: `Welcome ${playerId}!` }));
            broadcastPlayerList();

            if (players.length === maxPlayers && !rolesAssigned) {
                assignRoles();
                startTimer();
            }
        }

        if (data.type === "vote" && gamePhase === "day") {
            if (voters.includes(data.voter)) {
                ws.send(JSON.stringify({ type: "error", message: "You have already voted." }));
            } else {
                voters.push(data.voter);
                votes[data.voter] = data.target;
                broadcast({ type: "status", message: `${data.voter} has voted.` });

                if (Object.keys(votes).length === players.filter(p => p.alive).length) {
                    handleDayVote();
                    checkGameEnd();
                    switchPhase();
                }
            }
        }

        if (data.type === "kill" && gamePhase === "night") {
            const mafia = players.find(p => p.ws === ws);
            if (mafia && mafia.role === "mafia") {
                votes[data.voter] = data.target;
                const target = players.find(p => p.playerId === data.target);
                if (target) {
                    target.alive = false;
                    target.ws.send(JSON.stringify({ type: "eliminated", message: "You are eliminated" }));
                    target.ws.close();
                    broadcast({ type: "status", message: `${target.playerId} was eliminated by the mafia.` });
                }
                votes = {};
                checkGameEnd();
                switchPhase();
            }
        }
        if (data.type === "chat") {
            broadcast({ type: "chat", message: `${data.nickname}: ${data.message}` });
        }
    });

    ws.on('close', () => {
        players = players.filter(player => player.ws !== ws);
        broadcastPlayerList();
    });
});

console.log("WebSocket server is running on ws://0.0.0.0:3000");
