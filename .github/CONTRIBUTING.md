# Contributing to Almanac

Thank you for your interest in contributing to Almanac! This guide will help you get started.

## 🎯 Ways to Contribute

- **Report Bugs**: Use our bug report template
- **Suggest Features**: Use our feature request template
- **Improve Documentation**: Help make our docs clearer
- **Add Data Sources**: Integrate new data sources
- **Create MCP Servers**: Build new MCP server integrations
- **Optimize Performance**: Help make Almanac faster
- **Write Code**: Fix bugs or implement features

## 🚀 Getting Started

### Prerequisites

- Node.js >= 24.0.0
- pnpm >= 8.0.0
- Docker Desktop or Docker Engine
- Git

### Development Setup

1. **Fork and Clone**

   ```bash
   git clone https://github.com/YOUR_USERNAME/almanac.git
   cd almanac
   ```

2. **Install Dependencies**

   ```bash
   pnpm install
   ```

3. **Start Development Environment**

   ```bash
   pnpm start
   ```

4. **Make Your Changes**
   - Create a new branch: `git checkout -b feature/your-feature-name`
   - Make your changes
   - Test thoroughly

5. **Commit and Push**

   ```bash
   git add .
   git commit -m "feat: add your feature description"
   git push origin feature/your-feature-name
   ```

6. **Create Pull Request**
   - Go to GitHub and create a PR from your branch
   - Fill out the PR template completely
   - Link any related issues

## 📝 Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `perf:` - Performance improvements
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

Examples:

```
feat(mcp): add Jira MCP server integration
fix(search): resolve hybrid search ranking issue
docs(api): update query API documentation
perf(indexing): optimize vector indexing for large datasets
```

## 🏗️ Project Structure

```
almanac/
├── packages/
│   ├── client/              # React frontend
│   ├── server/              # Express backend
│   ├── indexing-engine/     # Data indexing
│   ├── benchmark/           # Performance benchmarks
│   ├── *-mcp-server/       # MCP server packages
│   └── shared-util/         # Shared utilities
├── docs/                    # Documentation
└── scripts/                 # Utility scripts
```

## 🧪 Testing

Before submitting a PR:

```bash
# Run linting
pnpm lint

# Run type checking
pnpm type-check

# Format code
pnpm format

# Run tests
pnpm test
```

## 📚 Adding Documentation

- Update relevant docs in `/docs` directory
- Keep README.md files updated in packages
- Add inline code comments for complex logic
- Include examples where helpful

## 🔌 Adding MCP Servers

To add a new MCP server integration:

1. Create a new package in `packages/[name]-mcp-server/`
2. Implement the MCP protocol
3. Add configuration in `packages/data-sources-config/`
4. Update documentation
5. Add tests
6. Submit PR with examples

See existing MCP servers for reference.

## 🔗 Adding Data Sources

To add a new data source:

1. Review the data source API documentation
2. Implement OAuth flow (if needed)
3. Create syncing logic
4. Add data transformation
5. Update indexing pipeline
6. Add comprehensive tests
7. Document configuration options

## 🐛 Reporting Bugs

When reporting bugs:

- Use the bug report template
- Provide clear reproduction steps
- Include relevant logs and configuration
- Specify your environment details
- Add screenshots if applicable

## 💡 Suggesting Features

When suggesting features:

- Use the feature request template
- Explain the problem it solves
- Describe your proposed solution
- Include use cases
- Consider implementation complexity

## ⚡ Performance Contributions

When optimizing performance:

- Include benchmark results
- Show before/after metrics
- Profile your changes
- Test with realistic data sizes
- Document any trade-offs

## 🔍 Code Review Process

1. All PRs require review
2. CI checks must pass
3. Code must follow project conventions
4. Tests should be included
5. Documentation should be updated

## 📜 Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Help others learn and grow
- Keep discussions focused and professional

## 🤝 Community

- Join discussions on GitHub
- Share your use cases
- Help answer questions
- Contribute to documentation

## 📄 License

By contributing, you agree that your contributions will be licensed under the project's license.

## 🙏 Thank You!

Your contributions make Almanac better for everyone. We appreciate your time and effort!

## ❓ Questions?

- Check the [documentation](./docs)
- Open a [discussion](https://github.com/reality-platforms/almanac/discussions)
- Create a [question issue](.github/ISSUE_TEMPLATE/question.yml)
