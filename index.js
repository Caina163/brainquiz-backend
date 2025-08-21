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

// Configuração de CORS para produção - CORRIGIDO PARA RENDER
app.use(cors({
  origin: ['https://brainquiz-wel0.onrender.com'],
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

// ROTA DE CADASTRO CORRIGIDA
app.post('/cadastro', async (req, res) => {
  try {
    const { usuario, senha, nome, sobrenome, email, telefone, fotoBase64 } = req.body;

    // Validações
    if (!usuario || !senha || !nome || !email) {
      return res.status(400).json({
        success: false,
        message: 'Campos obrigatórios: usuário, senha, nome e email'
      });
    }

    // Verificar se usuário já existe
    const usuarios = lerArquivoJSON('usuarios.json', []);
    const usuarioExistente = usuarios.find(u => u.usuario === usuario || u.email === email);

    if (usuarioExistente) {
      return res.status(409).json({
        success: false,
        message: 'Usuário ou email já cadastrado'
      });
    }

    // Hash da senha
    const senhaHash = await bcrypt.hash(senha, 10);

    // Criar novo usuário
    const novoUsuario = {
      id: gerarId(),
      usuario,
      senha: senhaHash,
      nome,
      sobrenome: sobrenome || '',
      email,
      telefone: telefone || '',
      fotoBase64: fotoBase64 || null,
      tipo: 'aluno', // Padrão
      ativo: true,
      criadoEm: new Date().toISOString(),
      ultimoLogin: null
    };

    usuarios.push(novoUsuario);
    salvarArquivoJSON('usuarios.json', usuarios);

    // Remover senha da resposta
    const { senha: _, ...usuarioResposta } = novoUsuario;

    res.status(201).json({
      success: true,
      message: 'Usuário cadastrado com sucesso',
      usuario: usuarioResposta
    });

  } catch (error) {
    console.error('Erro no cadastro:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// ROTA PARA CARREGAR USUÁRIOS
app.get('/api/usuarios', autenticarToken, (req, res) => {
  try {
    const usuarios = lerArquivoJSON('usuarios.json', []);
    // Remover senhas da resposta
    const usuariosSemSenha = usuarios.map(({ senha, ...usuario }) => usuario);
    res.json({ success: true, usuarios: usuariosSemSenha });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao carregar usuários' });
  }
});

// ROTA PARA CARREGAR CADASTROS PENDENTES
app.get('/api/cadastros-pendentes', autenticarToken, (req, res) => {
  try {
    const cadastros = lerArquivoJSON('cadastros_pendentes.json', []);
    res.json({ success: true, cadastros });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao carregar cadastros pendentes' });
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

// ROTA PARA UPLOAD DE PDF - CORRIGIDA
app.post('/api/upload-pdf', autenticarToken, upload.single('pdf'), (req, res) => {
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
      dataUpload: new Date().toISO
