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

        // 마피아에게만 추가 행동 요청
        if (player.role === "mafia") {
            player.ws.send(JSON.stringify({ type: "action", message: "You can kill a player at night.", action: "kill" }));
        }
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
function handleVoting() {
    let voteTimeLeft = 30; // 투표 시간 30초
    broadcast({ type: "status", message: `Voting time started. You have ${voteTimeLeft} seconds to vote.` });
    broadcast({ type: "voteStart" });

    const voteTimer = setInterval(() => {
        voteTimeLeft--;
        broadcast({ type: "timer", timeLeft: voteTimeLeft });

        if (voteTimeLeft <= 0 || Object.keys(votes).length === players.filter(p => p.alive).length) {
            clearInterval(voteTimer);
            handleDayVote();
            switchPhase();
        }
    }, 1000);
}

// 낮 투표 로직 수정
function handleDayVote() {
    const alivePlayers = players.filter(player => player.alive);
    const voteCounts = {};

    // 투표 결과 집계
    Object.values(votes).forEach(vote => {
        voteCounts[vote] = (voteCounts[vote] || 0) + 1;
    });

    const sortedVotes = Object.entries(voteCounts).sort((a, b) => b[1] - a[1]);

    // 투표 데이터가 없을 경우 처리
    if (sortedVotes.length === 0) {
        broadcast({ type: "status", message: "No votes were cast. Moving to the night phase." });
        votes = {};
        return;
    }

    // 최다 득표자 확인
    if (sortedVotes.length > 1 && sortedVotes[0][1] === sortedVotes[1][1]) {
        broadcast({ type: "status", message: "Vote is tied. Moving to the night phase." });
    } else {
        const eliminated = sortedVotes[0][0];
        const player = alivePlayers.find(p => p.playerId === eliminated);

        if (player) {
            player.alive = false;
            player.ws.close();
            broadcast({ type: "status", message: `${player.playerId} has been eliminated by vote.` });
        }
    }
    votes = {};
}

// 마피아 밤 행동 로직 추가
function handleNightAction() {
    if (gamePhase === "night") {
        const mafia = players.find(player => player.role === "mafia" && player.alive);
        if (!mafia) return;

        mafia.ws.send(JSON.stringify({ type: "action", message: "Who would you like to kill?", options: players.filter(p => p.alive && p.role !== "mafia").map(p => p.playerId) }));

        const nightTimer = setTimeout(() => {
            if (Object.keys(votes).length > 0) {
                const targetId = Object.values(votes)[0];
                const target = players.find(p => p.playerId === targetId);
                if (target) {
                    target.alive = false;
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

    if (aliveMafia === 0) {
        broadcast({ type: "gameEnd", winner: "Citizens", message: "Citizens win! The mafia has been eliminated." });
        endGame();
    } else if (aliveMafia >= aliveCitizens) {
        broadcast({ type: "gameEnd", winner: "Mafia", message: "Mafia wins! They outnumber the citizens." });
        endGame();
    }
}

function endGame() {
    broadcast({ type: "status", message: "Game Over!" });
    players.forEach(player => player.ws.close()); // 모든 연결 닫기
    players = [];
    votes = {};
    rolesAssigned = false;
    gamePhase = "day";
    clearInterval(timer); // 타이머 초기화
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

        // 닉네임 설정 처리
        if (data.type === "setNickname") {
            const playerId = data.nickname;
            players.push({ ws, playerId, role: null, alive: true });
            ws.send(JSON.stringify({ type: "welcome", message: `Welcome ${playerId}!` }));
            broadcastPlayerList();

            // 플레이어가 모두 들어왔을 때만 역할을 할당하고 게임을 시작
            if (players.length === maxPlayers && !rolesAssigned) {
                console.log("All players connected. Assigning roles and starting the game...");
                assignRoles(); // 게임 시작
                startTimer();  // 타이머 시작
            }
        }

        // 채팅 메시지 처리
        if (data.type === "chat") {
            broadcast({ type: "chat", nickname: data.nickname, message: data.message });
        }

        // 낮 투표 처리
        if (data.type === "vote" && gamePhase === "day") {
            votes[data.voter] = data.target;
            broadcast({ type: "status", message: `${data.voter} has voted.` });
            if (Object.keys(votes).length === players.filter(p => p.alive).length) {
                handleDayVote();
                checkGameEnd();
                switchPhase();
            }
        }

        // 밤 행동(마피아 킬) 처리
        if (data.type === "kill" && gamePhase === "night") {
            const mafia = players.find(p => p.ws === ws);
            if (mafia && mafia.role === "mafia") {
                votes[data.voter] = data.target;
                const target = players.find(p => p.playerId === data.target);
                if (target) {
                    target.alive = false;
                    target.ws.close();
                    broadcast({ type: "status", message: `${target.playerId} was eliminated by the mafia.` });
                }
                votes = {};
                checkGameEnd();
                switchPhase();
            }
        }
    });

    ws.on('close', () => {
        console.log("Client disconnected.");
        players = players.filter(player => player.ws !== ws);
        broadcastPlayerList();
    });
});

console.log("WebSocket server is running on ws://0.0.0.0:3000");
