import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mongoServer: MongoMemoryServer | null = null;
let mcpServer: ChildProcess | null = null;

/**
 * Start MongoDB Memory Server and connect Mongoose
 */
export async function setupMongoDB(): Promise<void> {
  mongoServer = await MongoMemoryServer.create({
    instance: {
      dbName: 'almanac-test',
    },
  });

  const uri = mongoServer.getUri();

  await mongoose.connect(uri, {
    dbName: 'almanac-test',
  });

  console.log('✅ MongoDB Memory Server started and connected');
}

/**
 * Disconnect from MongoDB and stop Memory Server
 */
export async function teardownMongoDB(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  if (mongoServer) {
    await mongoServer.stop();
    mongoServer = null;
  }

  console.log('✅ MongoDB Memory Server stopped');
}

/**
 * Clear all collections in the database
 */
export async function clearDatabase(): Promise<void> {
  const collections = mongoose.connection.collections;

  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
}

/**
 * Start the clone-mcp-server
 */
export async function setupCloneMCPServer(port: number = 4000): Promise<void> {
  return new Promise((resolve, reject) => {
    // Find the clone-mcp-server directory
    const cloneMcpServerPath = path.resolve(__dirname, '../../../clone-mcp-server');

    console.log(`Starting clone-mcp-server on port ${port}...`);

    mcpServer = spawn('pnpm', ['start-streamable'], {
      cwd: cloneMcpServerPath,
      env: {
        ...process.env,
        PORT: port.toString(),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';

    mcpServer.stdout?.on('data', (data) => {
      output += data.toString();
      // Look for server start message
      if (output.includes('MCP Server listening') || output.includes(`port ${port}`)) {
        // Give it a moment to fully initialize
        setTimeout(() => resolve(), 1000);
      }
    });

    mcpServer.stderr?.on('data', (data) => {
      console.error('MCP Server stderr:', data.toString());
    });

    mcpServer.on('error', (error) => {
      reject(new Error(`Failed to start clone-mcp-server: ${error.message}`));
    });

    mcpServer.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`clone-mcp-server exited with code ${code}`));
      }
    });

    // Fallback timeout - resolve after 5 seconds even if we didn't see the message
    setTimeout(() => {
      console.log('⚠️  Timeout waiting for server startup message, proceeding anyway...');
      resolve();
    }, 5000);
  });
}

/**
 * Stop the clone-mcp-server
 */
export async function teardownCloneMCPServer(): Promise<void> {
  if (mcpServer) {
    mcpServer.kill('SIGTERM');

    // Wait for process to exit
    await new Promise<void>((resolve) => {
      if (!mcpServer) {
        resolve();
        return;
      }

      mcpServer.on('exit', () => {
        resolve();
      });

      // Force kill after 5 seconds
      setTimeout(() => {
        if (mcpServer && !mcpServer.killed) {
          mcpServer.kill('SIGKILL');
        }
        resolve();
      }, 5000);
    });

    mcpServer = null;
    console.log('✅ clone-mcp-server stopped');
  }
}
