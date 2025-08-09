const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'brainquiz-super-secret-key-2025';

// Configuração de CORS para produção
app.use(cors({
  origin: ['https://brainquiiz.netlify.app', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // 100 requests por IP
  message: { success: false, message: 'Muitas tentativas. Tente novamente em 15 minutos.' }
});

app.use(limiter);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Configuração do multer para upload
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos PDF são permitidos'));
    }
  }
});

// Função para ler arquivos JSON com fallback
function lerArquivoJSON(nomeArquivo, defaultValue = []) {
  try {
    const caminho = path.join(__dirname, nomeArquivo);
    if (fs.existsSync(caminho)) {
      const conteudo = fs.readFileSync(caminho, 'utf8');
      return JSON.parse(conteudo);
    }
  } catch (error) {
    console.error(`Erro ao ler ${nomeArquivo}:`, error);
  }
  return defaultValue;
}

// Função para salvar arquivos JSON
function salvarArquivoJSON(nomeArquivo, dados) {
  try {
    const caminho = path.join(__dirname, nomeArquivo);
    fs.writeFileSync(caminho, JSON.stringify(dados, null, 2));
    return true;
  } catch (error) {
    console.error(`Erro ao salvar ${nomeArquivo}:`, error);
    return false;
  }
}

// Função para gerar IDs únicos
function gerarId() {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

// Middleware de autenticação
function autenticarToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Token não fornecido' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Token inválido' });
    }
    req.user = user;
    next();
  });
}

// ROTA DE LOGIN CORRIGIDA
app.post('/login', async (req, res) => {
  try {
    const { usuario, senha } = req.body;

    if (!usuario || !senha) {
      return res.status(400).json({ 
        success: false, 
        message: 'Usuário e senha são obrigatórios' 
      });
    }

    // Carregar usuários do arquivo
    const usuarios = lerArquivoJSON('usuarios.json', []);
    const usuarioEncontrado = usuarios.find(u => u.usuario === usuario && u.ativo);

    if (!usuarioEncontrado) {
      return res.status(401).json({ 
        success: false, 
        message: 'Usuário não encontrado' 
      });
    }

    // Verificar senha - suportar tanto texto puro quanto hash
    let senhaValida = false;
    
    if (usuarioEncontrado.senha.startsWith('$2b$')) {
      // Senha hasheada com bcrypt
      senhaValida = await bcrypt.compare(senha, usuarioEncontrado.senha);
    } else {
      // Senha em texto puro (apenas para admin legado)
      senhaValida = senha === usuarioEncontrado.senha;
      
      // IMPORTANTE: Converter senha do admin para hash na primeira execução
      if (senhaValida && usuarioEncontrado.usuario === 'admin') {
        const senhaHash = await bcrypt.hash(senha, 10);
        usuarioEncontrado.senha = senhaHash;
        usuarioEncontrado.senhaConvertidaEm = new Date().toISOString();
        salvarArquivoJSON('usuarios.json', usuarios);
      }
    }

    if (!senhaValida) {
      return res.status(401).json({ 
        success: false, 
        message: 'Senha incorreta' 
      });
    }

    // Atualizar último login
    usuarioEncontrado.ultimoLogin = new Date().toISOString();
    salvarArquivoJSON('usuarios.json', usuarios);

    // Gerar token JWT
    const token = jwt.sign(
      { 
        id: usuarioEncontrado.id,
        usuario: usuarioEncontrado.usuario,
        tipo: usuarioEncontrado.tipo 
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Dados do usuário (sem senha)
    const { senha: _, ...dadosUsuario } = usuarioEncontrado;

    res.json({
      success: true,
      message: 'Login realizado com sucesso',
      token,
      usuario: dadosUsuario
    });

  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro interno do servidor' 
    });
  }
});

// ROTA PARA VERIFICAR USUÁRIO LOGADO
app.get('/usuario', autenticarToken, (req, res) => {
  try {
    const usuarios = lerArquivoJSON('usuarios.json', []);
    const usuario = usuarios.find(u => u.id === req.user.id);

    if (!usuario || !usuario.ativo) {
      return res.status(401).json({ 
        success: false, 
        message: 'Usuário não encontrado ou inativo' 
      });
    }

    const { senha: _, ...dadosUsuario } = usuario;
    
    res.json({
      success: true,
      usuario: dadosUsuario
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Erro ao verificar usuário' 
    });
  }
});

// ROTA PARA CARREGAR PDFS
app.get('/api/pdfs', autenticarToken, (req, res) => {
  try {
    const pdfs = lerArquivoJSON('pdfs.json', []);
    res.json({ success: true, pdfs });
  } catch (error) {
    console.error('Erro ao carregar PDFs:', error);
    res.status(500).json({ success: false, message: 'Erro ao carregar PDFs' });
  }
});

// ROTA PARA UPLOAD DE PDF
app.post('/upload-pdf', autenticarToken, upload.single('pdf'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Arquivo não encontrado' });
    }

    const pdfData = {
      id: gerarId(),
      nome: req.file.originalname,
      dados: `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`,
      base64: `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`,
      bloqueado: false,
      uploadedBy: req.user.usuario,
      uploadedAt: new Date().toISOString(),
      dataUpload: new Date().toISOString()
    };

    const pdfs = lerArquivoJSON('pdfs.json', []);
    pdfs.push(pdfData);
    salvarArquivoJSON('pdfs.json', pdfs);

    res.json({ success: true, pdf: pdfData });
  } catch (error) {
    console.error('Erro no upload:', error);
    res.status(500).json({ success: false, message: 'Erro no upload' });
  }
});

// ROTAS PARA QUIZZES
app.get('/api/quizzes', autenticarToken, (req, res) => {
  try {
    const quizzes = lerArquivoJSON('quizzes.json', []);
    res.json({ success: true, quizzes });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao carregar quizzes' });
  }
});

app.get('/api/quizzes/arquivados', autenticarToken, (req, res) => {
  try {
    const arquivados = lerArquivoJSON('quizzes_arquivados.json', []);
    res.json({ success: true, quizzes: arquivados });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao carregar quizzes arquivados' });
  }
});

app.get('/api/quizzes/excluidos', autenticarToken, (req, res) => {
  try {
    const excluidos = lerArquivoJSON('quizzes_excluidos.json', []);
    res.json({ success: true, quizzes: excluidos });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao carregar quizzes excluídos' });
  }
});

// SISTEMA DE QUIZ TEMPORÁRIO
let quizTemporario = null;

app.post('/api/quiz-temp', autenticarToken, (req, res) => {
  try {
    const quizData = req.body;
    quizTemporario = {
      ...quizData,
      id: gerarId(),
      createdAt: Date.now(),
      createdBy: req.user.usuario
    };
    
    res.json({ success: true, quizId: quizTemporario.id });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao salvar quiz temporário' });
  }
});

app.get('/api/quiz-temp', autenticarToken, (req, res) => {
  try {
    if (quizTemporario && Date.now() - quizTemporario.createdAt < 3600000) { // 1 hora
      res.json({ success: true, quiz: quizTemporario });
    } else {
      res.status(404).json({ success: false, message: 'Quiz temporário não encontrado' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao carregar quiz temporário' });
  }
});

// ROTA PARA SALVAR QUIZZES
app.post('/api/quizzes', autenticarToken, (req, res) => {
  try {
    const quizData = {
      ...req.body,
      id: gerarId(),
      criadoPor: req.user.usuario,
      criadoEm: new Date().toISOString()
    };

    const quizzes = lerArquivoJSON('quizzes.json', []);
    quizzes.push(quizData);
    salvarArquivoJSON('quizzes.json', quizzes);

    res.json({ success: true, quiz: quizData });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao salvar quiz' });
  }
});

// ROTA DE LOG DE ERROS
app.post('/api/error-log', (req, res) => {
  try {
    const errorLog = {
      ...req.body,
      timestamp: new Date().toISOString(),
      ip: req.ip
    };
    
    console.error('🚨 Error logged:', errorLog);
    
    // Em produção, salvar em arquivo ou enviar para serviço de monitoramento
    const logs = lerArquivoJSON('error_logs.json', []);
    logs.push(errorLog);
    
    // Manter apenas os últimos 1000 logs
    if (logs.length > 1000) {
      logs.splice(0, logs.length - 1000);
    }
    
    salvarArquivoJSON('error_logs.json', logs);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao salvar log:', error);
    res.status(500).json({ success: false });
  }
});

// Middleware de tratamento de erros global
app.use((error, req, res, next) => {
  console.error('🚨 Erro não tratado:', error);
  res.status(500).json({
    success: false,
    message: 'Erro interno do servidor'
  });
});

// Rota 404
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint não encontrado'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🔒 JWT Secret configurado: ${JWT_SECRET.substring(0, 10)}...`);
  
  // Verificar arquivos essenciais na inicialização
  const arquivos = ['usuarios.json', 'pdfs.json', 'quizzes.json'];
  arquivos.forEach(arquivo => {
    if (!fs.existsSync(path.join(__dirname, arquivo))) {
      console.warn(`⚠️  Arquivo ${arquivo} não encontrado, será criado quando necessário`);
    }
  });
});
