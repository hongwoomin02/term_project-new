const WebSocket = require('ws');
const express = require('express');
const path = require('path');
const http = require('http');

// Express 앱 생성
const app = express();

// 정적 파일 제공 설정
app.use(express.static(path.join(__dirname, 'public')));

// HTML 기본 라우트 설정 (필요 시)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// HTTP 서버 생성 및 WebSocket 서버 결합
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let players = [];
let maxPlayers = 5;
let votes = {};
let voters = []; // 투표한 플레이어 추적
let gamePhase = "아침";
let rolesAssigned = false;
let timer = null;

function assignRoles() {
    const shuffledPlayers = [...players];
    shuffledPlayers.sort(() => 0.5 - Math.random());
    shuffledPlayers[0].role = "mafia";
    shuffledPlayers.slice(1).forEach(player => player.role = "citizen");
    rolesAssigned = true;
    broadcast({ type: "status", message: "게임이 시작되었습니다!" });
    let rolesAssignedCount = 0;

    players.forEach(player => {
        player.ws.send(JSON.stringify({ type: "role", role: player.role, message: `Your role is ${player.role}` }), () => {
            rolesAssignedCount++;
            if (rolesAssignedCount === players.length) {
                startTimer();
            }
        });

        if (player.role === "mafia") {
            player.ws.send(JSON.stringify({ type: "action", message: "You can kill a player at night.", action: "kill" }));
        }
    });
}

function switchPhase() {
    // 게임이 실행 중인지 확인
    if (!rolesAssigned || players.length !== maxPlayers) {
        console.log("Cannot switch phase. Roles assigned:", rolesAssigned, "Players:", players.length);
        return;
    }

    gamePhase = gamePhase === "아침" ? "밤" : "아침";
    voters = []; // 새 단계 시작 시 투표자 목록 초기화
    broadcast({ type: "phase", message: `지금은 ${gamePhase}입니다.` });
    startTimer();
}


function startTimer() {
    // 실행 조건 강화
    if (players.length !== maxPlayers || !rolesAssigned) {
        console.log("Timer cannot start. Players:", players.length, "Roles assigned:", rolesAssigned);
        return;
    }

    if (timer) clearInterval(timer);

    let timeLeft = 30; // 30초 타이머
    broadcast({ type: "timer", timeLeft });

    timer = setInterval(() => {
        timeLeft--;
        broadcast({ type: "timer", timeLeft });

        if (timeLeft <= 0) {
            clearInterval(timer);
            timer = null;
            if (gamePhase === "아침") {
                handleDayVote();
            } else if (gamePhase === "밤") {
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
    if (gamePhase === "밤") {
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

                if (!target || !target.alive) {
                    mafia.ws.send(JSON.stringify({ type: "error", message: "Invalid target. No one was killed." }));
                    broadcast({ type: "chat", message: "No one was eliminated during the night." });
                } else {
                    target.alive = false;
                    target.ws.send(JSON.stringify({ type: "eliminated", message: "You are eliminated" }));
                    target.ws.close();
                    broadcast({ type: "chat", message: `${target.playerId} was eliminated by the Mafia.` });
                }
            } else {
                broadcast({ type: "chat", message: "No one was eliminated during the night." });
            }
            votes = {};
            switchPhase();
        }, 30000); // 30초 타이머
    }
}

function checkGameEnd() {
    // 생존 상태 확인
    const aliveMafia = players.filter(player => player.role === "mafia" && player.alive).length;
    const aliveCitizens = players.filter(player => player.role === "citizen" && player.alive).length;

    console.log("DEBUG: Checking game end conditions...");
    console.log("Alive Mafia:", aliveMafia, "Alive Citizens:", aliveCitizens);

    // 시민 승리 조건: 모든 마피아가 제거됨
    if (aliveMafia === 0) {
        console.log("DEBUG: Citizens win!");
        broadcast({ type: "gameEnd", winner: "Citizens", message: "Citizens win! The mafia has been eliminated." });
        endGame("Citizens");
        return; // 종료 후 추가 처리를 방지
    }

    // 마피아 승리 조건: 마피아 수가 시민 수 이상
    if (aliveMafia >= aliveCitizens) {
        console.log("DEBUG: Mafia wins!");
        broadcast({ type: "gameEnd", winner: "Mafia", message: "Mafia wins! They outnumber the citizens." });
        endGame("Mafia");
        return; // 종료 후 추가 처리를 방지
    }

    console.log("DEBUG: Game continues.");
}


function endGame(winner) {
    console.log("DEBUG: Ending game. Winner:", winner);

    // 클라이언트에 게임 종료 메시지 전송
    broadcast({ type: "status", message: `Game Over! The ${winner} team wins!` });
    players.forEach(player => {
        if (player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(JSON.stringify({
                type: "gameOver",
                winner: winner,
                message: `Game Over! The ${winner} team wins!`
            }));
        }
    });

    // 서버 상태 초기화
    players = [];
    votes = {};
    voters = [];
    rolesAssigned = false;
    gamePhase = "아침";
    if (timer) clearInterval(timer);
    timer = null;

    console.log("Game has been reset. Waiting for players...");
}


function broadcast(data) {
    players.forEach(player => {
        if (player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(JSON.stringify(data));
        }
    });
}
function broadcastPlayerList() {
    // 살아있는 플레이어 목록을 가져오고 이를 문자열로 변환
    const playerList = players.filter(p => p.alive).map(player => player.playerId);
    // 클라이언트로 플레이어 목록 전송
    broadcast({ type: "playerList", players: playerList });
}

wss.on('connection', (ws) => {
    console.log("New client connected.");

    if (rolesAssigned) {
        ws.send(JSON.stringify({ type: "error", message: "Game is already in progress. Please wait for the next round." }));
        ws.close();
        return;
    }
    if (players.length >= maxPlayers) {
        ws.send(JSON.stringify({ type: "error", message: "Game is full" }));
        ws.close();
        return;
    }

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        if (data.type === "setNickname") {
            const playerId = data.nickname;

            // 이미 같은 이름이 등록된 경우 차단
            if (players.some(p => p.playerId === playerId)) {
                ws.send(JSON.stringify({ type: "error", message: "Nickname already taken. Please choose another." }));
                return;
            }

            players.push({ ws, playerId, role: null, alive: true });
            ws.send(JSON.stringify({ type: "welcome", message: `Welcome ${playerId}!` }));
            broadcastPlayerList();

            // 플레이어가 5명 도달하면 게임 시작
            if (players.length === maxPlayers && !rolesAssigned) {
                assignRoles();
                startTimer();
            }
        }
        if (data.type === "vote" && gamePhase === "아침") {
            if (voters.includes(data.voter)) {
                ws.send(JSON.stringify({ type: "error", message: "You have already voted." }));
            } else if (!players.some(p => p.playerId === data.target && p.alive)) {
                ws.send(JSON.stringify({ type: "error", message: "Invalid vote target." }));
            } else {
                voters.push(data.voter);
                votes[data.voter] = data.target;
                broadcast({ type: "chat", message: `${data.voter} has voted.` });
        
                if (Object.keys(votes).length === players.filter(p => p.alive).length) {
                    handleDayVote();
                    checkGameEnd();
                    switchPhase();
                }
            }
        }
        

        if (data.type === "kill" && gamePhase === "밤") {
            const mafia = players.find(p => p.ws === ws);
            if (mafia && mafia.role === "mafia") {
                const target = players.find(p => p.playerId === data.target && p.alive);
                
                // 타겟 유효성 검사
                if (!target) {
                    mafia.ws.send(JSON.stringify({ 
                        type: "error", 
                        message: `Invalid target: ${data.target} does not exist or is already dead.` 
                    }));
                    return; // 잘못된 타겟이므로 함수 종료
                }
        
                // 유효한 타겟일 경우 처리
                votes[mafia.playerId] = data.target;
                target.alive = false;
                target.ws.send(JSON.stringify({ type: "eliminated", message: "You are eliminated" }));
                target.ws.close();
                
                broadcast({ type: "chat", message: `${target.playerId} was eliminated by the mafia.` });
        
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

server.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
    console.log('WebSocket server is running on ws://0.0.0.0:3000');
});
