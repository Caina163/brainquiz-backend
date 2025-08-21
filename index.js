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

// Configuração de CORS
app.use(cors({
  origin: ['https://brainquiz-wel0.onrender.com'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: 'Muitas tentativas. Tente novamente em 15 minutos.' }
});

app.use(limiter);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ===== CONFIGURAÇÕES PARA SERVIR ARQUIVOS ESTÁTICOS =====

// Servir arquivos estáticos (CSS, JS, imagens, etc.)
app.use(express.static(__dirname));

// Rota principal - servir index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'), (err) => {
    if (err) {
      console.error('Erro ao servir index.html:', err);
      res.status(404).send('Página não encontrada');
    }
  });
});

// Servir arquivos HTML específicos
app.get('/*.html', (req, res) => {
  const fileName = req.params[0] + '.html';
  const filePath = path.join(__dirname, fileName);
  
  // Verificar se o arquivo existe antes de tentar servir
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    // Se arquivo não existe, redirecionar para index.html
    res.sendFile(path.join(__dirname, 'index.html'));
  }
});

// ===== FIM DAS CONFIGURAÇÕES DE ARQUIVOS ESTÁTICOS =====

// Configuração do multer
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos PDF são permitidos'));
    }
  }
});

// Funções utilitárias
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

// ROTAS DE AUTENTICAÇÃO

// Login
app.post('/login', async (req, res) => {
  try {
    const { usuario, senha } = req.body;

    if (!usuario || !senha) {
      return res.status(400).json({ 
        success: false, 
        message: 'Usuário e senha são obrigatórios' 
      });
    }

    const usuarios = lerArquivoJSON('usuarios.json', []);
    const usuarioEncontrado = usuarios.find(u => u.usuario === usuario && u.ativo);

    if (!usuarioEncontrado) {
      return res.status(401).json({ 
        success: false, 
        message: 'Usuário não encontrado' 
      });
    }

    let senhaValida = false;
    
    if (usuarioEncontrado.senha.startsWith('$2b$')) {
      senhaValida = await bcrypt.compare(senha, usuarioEncontrado.senha);
    } else {
      senhaValida = senha === usuarioEncontrado.senha;
      
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

    usuarioEncontrado.ultimoLogin = new Date().toISOString();
    salvarArquivoJSON('usuarios.json', usuarios);

    const token = jwt.sign(
      { 
        id: usuarioEncontrado.id,
        usuario: usuarioEncontrado.usuario,
        tipo: usuarioEncontrado.tipo 
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

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

// Verificar usuário
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

// Cadastro
app.post('/cadastro', async (req, res) => {
  try {
    const { usuario, senha, nome, sobrenome, email, telefone, fotoBase64 } = req.body;

    if (!usuario || !senha || !nome || !email) {
      return res.status(400).json({
        success: false,
        message: 'Campos obrigatórios: usuário, senha, nome e email'
      });
    }

    const usuarios = lerArquivoJSON('usuarios.json', []);
    const usuarioExistente = usuarios.find(u => u.usuario === usuario || u.email === email);

    if (usuarioExistente) {
      return res.status(409).json({
        success: false,
        message: 'Usuário ou email já cadastrado'
      });
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    const novoUsuario = {
      id: gerarId(),
      usuario,
      senha: senhaHash,
      nome,
      sobrenome: sobrenome || '',
      email,
      telefone: telefone || '',
      fotoBase64: fotoBase64 || null,
      tipo: 'aluno',
      ativo: true,
      criadoEm: new Date().toISOString(),
      ultimoLogin: null
    };

    usuarios.push(novoUsuario);
    salvarArquivoJSON('usuarios.json', usuarios);

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

// ROTAS DA API

app.get('/api/usuarios', autenticarToken, (req, res) => {
  try {
    const usuarios = lerArquivoJSON('usuarios.json', []);
    const usuariosSemSenha = usuarios.map(({ senha, ...usuario }) => usuario);
    res.json({ success: true, usuarios: usuariosSemSenha });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao carregar usuários' });
  }
});

app.get('/api/cadastros-pendentes', autenticarToken, (req, res) => {
  try {
    const cadastros = lerArquivoJSON('cadastros_pendentes.json', []);
    res.json({ success: true, cadastros });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao carregar cadastros pendentes' });
  }
});

app.get('/api/pdfs', autenticarToken, (req, res) => {
  try {
    const pdfs = lerArquivoJSON('pdfs.json', []);
    res.json({ success: true, pdfs });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao carregar PDFs' });
  }
});

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

// Middleware de erro
app.use((error, req, res, next) => {
  console.error('Erro não tratado:', error);
  res.status(500).json({
    success: false,
    message: 'Erro interno do servidor'
  });
});

// 404 - IMPORTANTE: Esta rota deve ficar por último
app.use('*', (req, res) => {
  // Se for uma requisição para API, retornar JSON
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(404).json({
      success: false,
      message: 'Endpoint não encontrado'
    });
  }
  
  // Para todas as outras rotas, servir index.html (para SPA)
  res.sendFile(path.join(__dirname, 'index.html'), (err) => {
    if (err) {
      res.status(404).json({
        success: false,
        message: 'Página não encontrada'
      });
    }
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🔒 JWT Secret configurado`);
  console.log(`📁 Servindo arquivos estáticos do diretório: ${__dirname}`);
  
  // Criar arquivos JSON se não existirem
  const arquivos = ['usuarios.json', 'pdfs.json', 'quizzes.json', 'cadastros_pendentes.json', 'quizzes_arquivados.json', 'quizzes_excluidos.json'];
  arquivos.forEach(arquivo => {
    const caminho = path.join(__dirname, arquivo);
    if (!fs.existsSync(caminho)) {
      fs.writeFileSync(caminho, '[]');
      console.log(`📄 Arquivo ${arquivo} criado`);
    }
  });
  
  // Verificar se index.html existe
  const indexPath = path.join(__dirname, 'index.html');
  if (fs.existsSync(indexPath)) {
    console.log(`✅ index.html encontrado`);
  } else {
    console.log(`⚠️  index.html não encontrado em ${indexPath}`);
  }
});
