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
    broadcast({ type: "system", message: "게임이 시작되었습니다!" });
    let rolesAssignedCount = 0;

    players.forEach(player => {
        player.ws.send(JSON.stringify({ type: "role", role: player.role, message: `당신은 ${player.role}입니다` }), () => {
            rolesAssignedCount++;
            if (rolesAssignedCount === players.length) {
                startTimer();
            }
        });
    });
}

function switchPhase() {
    // 게임이 실행 중인지 확인
    if (checkGameEnd()) {
        return; // 게임 종료 시 단계 전환 방지
    }
    gamePhase = gamePhase === "아침" ? "밤" : "아침";
    voters = []; // 새 단계 시작 시 투표자 목록 초기화
    broadcast({ type: "status", message: `지금은 ${gamePhase}입니다.` });
    startTimer();
}


function startTimer() {
    // 실행 조건 강화
    if (checkGameEnd()) {
        return; // 게임 종료 시 타이머 시작 방지
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
        broadcast({ type: "system", message: "아무도 투표를 하지않았습니다. 밤이됩니다.." });
        votes = {};
        return;
    }

    if (sortedVotes.length > 1 && sortedVotes[0][1] === sortedVotes[1][1]) {
        broadcast({ type: "system", message: "투표가 동률입니다. 밤이됩니다.." });
    } else {
        const eliminated = sortedVotes[0][0];
        const player = alivePlayers.find(p => p.playerId === eliminated);

        if (player) {
            player.alive = false;
            player.ws.send(JSON.stringify({ type: "alert", message: "당신은 투표로 사망했습니다. 연결을 끊습니다..." }));
            player.ws.close();
            broadcast({ type:"system", message: `${player.playerId}님 투표에의해 사망했습니다.` });
        }
    }
    votes = {};
    checkGameEnd();
}

function handleNightAction() {
    if (gamePhase === "밤") {
        const mafia = players.find(player => player.role === "mafia" && player.alive);
        if (!mafia) return;

        const nightTimer = setTimeout(() => {
            if (Object.keys(votes).length > 0) {
                const targetId = Object.values(votes)[0];
                const target = players.find(p => p.playerId === targetId);

                if (!target || !target.alive) {
                    mafia.ws.send(JSON.stringify({ type: "system", message: "유효하지않는 타겟입니다." }));
                } else {
                    target.alive = false;
                    target.ws.send(JSON.stringify({ type: "alert", message: "당신은 마피아에의해 사망했습니다. 연결을 끊습니다..." }));
                    target.ws.close();
                    broadcast({ type: "system", message: `${target.playerId}는 마피아에의해 사망했습니다.` });
                }
            } else {
                broadcast({ type: "system", message: "밤동안 아무일도 없었습니다." });
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


    // 시민 승리 조건: 모든 마피아가 제거됨
    if (aliveMafia === 0) {
        endGame("Citizens");
        return true; // 종료 후 추가 처리를 방지
    }

    // 마피아 승리 조건: 마피아 수가 시민 수 이상
    if (aliveMafia >= aliveCitizens) {
        endGame("Mafia");
        return true; 
    }
    return false;
}

function endGame(winner) {
    broadcast({ type: "alert", message: `Game Over! ${winner}팀 승리!` });
    players.forEach(player => {
        player.alive = true; // 모든 플레이어 초기화
        player.role = null; // 역할 초기화
    });
    votes = {};
    voters = [];
    rolesAssigned = false;
    gamePhase = "아침";
    if (timer) clearInterval(timer);
    timer = null;
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
        ws.send(JSON.stringify({ type: "alert", message: "게임이 이미 진행중입니다.." }));
        ws.send(JSON.stringify({ type: "status", message: "연결을 끊습니다.." }));
        ws.close();
        return;
    }
    // if (players.length >= maxPlayers) {
    //     ws.send(JSON.stringify({ type: "alert", message: "게임 인원수가 다찼습니다.." }));
    //     ws.close();
    //     return;
    // }

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        if (data.type === "setNickname") {
            const playerId = data.nickname;

            // 이미 같은 이름이 등록된 경우 차단
            if (players.some(p => p.playerId === playerId)) {
                ws.send(JSON.stringify({ type: "error", message: "이미 등록된 닉네임입니다." }));
                return;
            }
            players.push({ ws, playerId, role: null, alive: true });
            broadcastPlayerList();

            // 플레이어가 5명 도달하면 게임 시작
            if (players.length === maxPlayers && !rolesAssigned) {
                assignRoles();
                startTimer();
            }
        }
        if (data.type === "vote") {
            if (!rolesAssigned) {
                ws.send(JSON.stringify({ type: "system", message: "게임이 아직 시작되지 않았습니다." }));
                return; // 게임 시작 전에는 투표 불가능
            }
            if (gamePhase === "밤") {
                ws.send(JSON.stringify({ type: "system", message: "아침에만 투표할 수 있습니다." }));
                return; // 밤에는 투표 동작 중지
            }
        
            if (voters.includes(data.voter)) {
                ws.send(JSON.stringify({ type: "system", message: "당신은 이미 투표를 했습니다." }));
            } else if (!players.some(p => p.playerId === data.target && p.alive)) {
                ws.send(JSON.stringify({ type: "system", message: "유효하지 않은 사람입니다." }));
            } else {
                voters.push(data.voter);
                votes[data.voter] = data.target;
                broadcast({ type: "system", message: `${data.voter}님이 투표했습니다.` });
        
                if (Object.keys(votes).length === players.filter(p => p.alive).length) {
                    handleDayVote();
                    checkGameEnd();
                    switchPhase();
                }
            }
        }
        

        if (data.type === "kill") {
            if (gamePhase === "아침") {
                ws.send(JSON.stringify({ type: "system", message: "밤에만 살해할 수 있습니다." }));
                return; // 낮에는 살해 동작 중지
            }
        
            const mafia = players.find(p => p.ws === ws);
            if (mafia && mafia.role === "mafia") {
                const target = players.find(p => p.playerId === data.target && p.alive);
        
                // 타겟 유효성 검사
                if (!target) {
                    mafia.ws.send(JSON.stringify({ type: "system", message: `유효하지 않은 타겟입니다.` }));
                    return; // 잘못된 타겟이므로 함수 종료
                }
        
                // 유효한 타겟일 경우 처리
                votes[mafia.playerId] = data.target;
                target.alive = false;
                target.ws.send(JSON.stringify({ type: "alert", message: "당신은 마피아에 의해 사망했습니다. 연결을 끊습니다.." }));
                target.ws.close();
        
                broadcast({ type: "system", message: `${target.playerId}님은 마피아에 의해 사망했습니다.` });
        
                votes = {};
                checkGameEnd();
                switchPhase();
            }
        }
        
        if (data.type === "chat") {
            if (gamePhase === "밤") {
                ws.send(JSON.stringify({ type: "system", message: "아침에만 채팅할 수 있습니다." }));
                return; // 밤에는 채팅 동작 중지
            }
            broadcast({ type: "chat", nickname: data.nickname, message: data.message });
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
