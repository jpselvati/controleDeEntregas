// Importa os módulos necessários
const express = require('express');
const mysql = require('mysql2/promise'); // Usando mysql2/promise para async/await
const dotenv = require('dotenv'); // Para carregar variáveis de ambiente

// Carrega as variáveis de ambiente do arquivo .env
dotenv.config();

// Inicializa o aplicativo Express
const app = express();
const port = process.env.PORT || 3000; // Define a porta, padrão 3000

// Middleware para parsear JSON no corpo das requisições
app.use(express.json());

// Configuração do pool de conexão com o banco de dados MySQL
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Middleware para verificar a conexão com o banco de dados
app.use(async (req, res, next) => {
    try {
        // Tenta obter uma conexão para verificar se o pool está funcionando
        const connection = await pool.getConnection();
        connection.release(); // Libera a conexão imediatamente
        next(); // Continua para a próxima rota
    } catch (err) {
        console.error('Erro ao conectar ao banco de dados:', err);
        res.status(500).json({ message: 'Erro interno do servidor: falha na conexão com o banco de dados.' });
    }
});

// --- Rotas da API ---

/**
 * @route GET /api/deliveries
 * @description Busca entregas com filtros opcionais.
 * @queryParam startDate {string} Data de início (formato YYYY-MM-DD).
 * @queryParam endDate {string} Data de fim (formato YYYY-MM-DD).
 * @queryParam pdv {number} ID do PDV (CAIXA ou COO).
 * @queryParam status {string} Status da entrega ('S' para entregue, 'N' para não entregue).
 * @returns {Array} Lista de objetos de entrega.
 */
app.get('/api/deliveries', async (req, res) => {
    const { startDate, endDate, pdv, status } = req.query;
    let query = 'SELECT * FROM entregas WHERE 1=1'; // 1=1 para facilitar a adição de condições

    const params = [];

    // Adiciona filtro por data de emissão
    if (startDate) {
        query += ' AND EMISSAO >= ?';
        params.push(startDate);
    }
    if (endDate) {
        query += ' AND EMISSAO <= ?';
        params.push(endDate);
    }

    // Adiciona filtro por PDV (assumindo que PDV pode ser CAIXA ou COO, ou ID_EMPRESA)
    // Para simplificar, vou usar CAIXA ou COO. Se for ID_EMPRESA, ajuste o nome da coluna.
    if (pdv) {
        // Você pode ajustar qual coluna representa o 'PDV' aqui (ex: CAIXA, COO, ID_EMPRESA)
        query += ' AND (CAIXA = ? OR COO = ?)';
        params.push(pdv, pdv);
    }

    // Adiciona filtro por status de entrega
    if (status) {
        // Valida se o status é 'S' ou 'N'
        if (status.toUpperCase() === 'S' || status.toUpperCase() === 'N') {
            query += ' AND ENTREGUE = ?';
            params.push(status.toUpperCase());
        } else {
            return res.status(400).json({ message: 'Status inválido. Use "S" para entregue ou "N" para não entregue.' });
        }
    }

    try {
        const [rows] = await pool.execute(query, params);
        res.json(rows);
    } catch (error) {
        console.error('Erro ao buscar entregas:', error);
        res.status(500).json({ message: 'Erro interno do servidor ao buscar entregas.' });
    }
});

/**
 * @route PUT /api/deliveries/:id/status
 * @description Atualiza o status de uma entrega e o nome do entregador.
 * @param id {number} ID da entrega a ser atualizada.
 * @body {object} Objeto contendo:
 * @property status {string} Novo status da entrega ('S' para entregue, 'N' para não entregue).
 * @property delivererName {string} Nome do entregador.
 * @returns {object} Mensagem de sucesso ou erro.
 */
app.put('/api/deliveries/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status, delivererName } = req.body;

    // Validação básica dos dados de entrada
    if (!status || (status.toUpperCase() !== 'S' && status.toUpperCase() !== 'N')) {
        return res.status(400).json({ message: 'Status é obrigatório e deve ser "S" ou "N".' });
    }
    if (!delivererName || typeof delivererName !== 'string' || delivererName.trim() === '') {
        return res.status(400).json({ message: 'Nome do entregador é obrigatório.' });
    }

    try {
        const [result] = await pool.execute(
            'UPDATE entregas SET ENTREGUE = ?, NOME = ? WHERE ID_ENTREGA = ?',
            [status.toUpperCase(), delivererName.trim(), id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: `Entrega com ID ${id} não encontrada.` });
        }

        res.json({ message: `Status da entrega ${id} atualizado para "${status.toUpperCase()}" e entregador definido como "${delivererName.trim()}".` });
    } catch (error) {
        console.error('Erro ao atualizar status da entrega:', error);
        res.status(500).json({ message: 'Erro interno do servidor ao atualizar status da entrega.' });
    }
});

// Inicia o servidor
app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
    console.log(`Para buscar entregas: GET http://localhost:${port}/api/deliveries?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&pdv=123&status=S`);
    console.log(`Para atualizar status: PUT http://localhost:${port}/api/deliveries/:id/status com body { "status": "S", "delivererName": "Nome do Entregador" }`);
});