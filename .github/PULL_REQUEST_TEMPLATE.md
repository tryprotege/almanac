<!--
Thank you for contributing to Almanac!
Please fill out this template to help us review your changes efficiently.
-->

## 📋 Description

<!-- Provide a clear and concise description of your changes -->

### What does this PR do?

<!-- Explain what problem this solves or what feature it adds -->

### Why is this change needed?

<!-- Provide context about why this change is important -->

### Related Issues

<!-- Link related issues using keywords: Fixes #123, Closes #456, Related to #789 -->

- Fixes #
- Related to #

---

## 🔄 Type of Change

<!-- Check all that apply -->

- [ ] 🐛 Bug fix (non-breaking change that fixes an issue)
- [ ] ✨ New feature (non-breaking change that adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] 📝 Documentation update
- [ ] 🎨 Code style/formatting update (no functional changes)
- [ ] ♻️ Refactoring (no functional changes, no API changes)
- [ ] ⚡ Performance improvement
- [ ] ✅ Test update
- [ ] 🔧 Configuration change
- [ ] 🔌 MCP Server integration
- [ ] 🗄️ Data source integration
- [ ] 🏗️ Infrastructure/build change

---

## 🧪 Testing

### How has this been tested?

<!-- Describe the tests you ran and how to reproduce them -->

- [ ] Tested locally
- [ ] Added unit tests
- [ ] Added integration tests
- [ ] Tested with real data sources
- [ ] Tested in Docker environment
- [ ] Benchmarked performance

### Test Configuration

<!-- Provide details about your test environment -->

- **Node version**:
- **pnpm version**:
- **OS**:
- **Browser** (if applicable):

### Test Commands Run

```bash
# Add commands you ran to test this
pnpm test
pnpm type-check
pnpm lint
```

---

## 📸 Screenshots / Recordings

<!-- If applicable, add screenshots or recordings to help explain your changes -->

### Before

<!-- Show the state before your changes -->

### After

<!-- Show the state after your changes -->

---

## 📦 Affected Packages

<!-- Check all packages that are modified by this PR -->

- [ ] `client` - React frontend
- [ ] `server` - Express backend
- [ ] `indexing-engine` - Data indexing
- [ ] `benchmark` / `benchmarking` - Performance testing
- [ ] `shared-util` - Shared utilities
- [ ] MCP Server: <!-- specify which one -->
- [ ] Documentation
- [ ] Root configuration
- [ ] Other: <!-- specify -->

---

## 🔍 Implementation Details

### Key Changes

<!-- List the main changes in bullet points -->

-
-
-

### Technical Approach

<!-- Explain your technical approach and any important decisions -->

### Alternatives Considered

<!-- Describe any alternative approaches you considered and why you chose this one -->

---

## 📚 Documentation

<!-- Check all that apply -->

- [ ] Updated relevant documentation in `/docs`
- [ ] Updated package README
- [ ] Added inline code comments
- [ ] Added JSDoc/TSDoc comments
- [ ] Updated API documentation
- [ ] Added usage examples
- [ ] Updated CHANGELOG (if applicable)
- [ ] No documentation needed

---

## ✅ Checklist

<!-- Ensure all items are completed before submitting -->

### Code Quality

- [ ] My code follows the project's style guidelines
- [ ] I have performed a self-review of my code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] My changes generate no new warnings or errors
- [ ] I have run `pnpm lint` and fixed any issues
- [ ] I have run `pnpm type-check` and resolved all type errors
- [ ] I have run `pnpm format` to format my code

### Testing

- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] I have tested this in a Docker environment (if applicable)
- [ ] I have tested with realistic data volumes (if applicable)

### Commits

- [ ] My commits follow the [Conventional Commits](https://www.conventionalcommits.org/) specification
- [ ] My commit messages are clear and descriptive
- [ ] I have squashed any "fix typo" or "wip" commits

### Dependencies

- [ ] I have not added unnecessary dependencies
- [ ] New dependencies are properly justified in the PR description
- [ ] `pnpm-lock.yaml` is updated (if dependencies changed)

### Breaking Changes

- [ ] This PR does not introduce breaking changes
- [ ] OR: Breaking changes are documented and migration guide is provided

### Performance

- [ ] This change does not negatively impact performance
- [ ] OR: Performance impact is documented and justified
- [ ] I have included benchmark results (if applicable)

---

## 🚀 Deployment Notes

<!-- Any special considerations for deploying this change? -->

### Prerequisites

<!-- List any steps that need to be taken before deploying -->

- [ ] No prerequisites

### Configuration Changes

<!-- Document any new environment variables or configuration -->

### Database Migrations

<!-- Document any database changes -->

- [ ] No database changes
- [ ] Migrations are backward compatible
- [ ] Migration instructions included

### Post-Deployment

<!-- Any steps needed after deployment? -->

---

## 🎯 Performance Impact

<!-- If applicable, provide performance metrics -->

### Benchmarks

<!-- Include before/after benchmark results -->

### Resource Usage

<!-- Document any changes in memory, CPU, or disk usage -->

---

## 🔐 Security Considerations

<!-- Address any security implications -->

- [ ] No security implications
- [ ] Security review completed
- [ ] Sensitive data is properly handled
- [ ] API keys/secrets are not exposed
- [ ] Input validation is implemented

---

## 🤔 Questions for Reviewers

<!-- Any specific questions or areas you'd like reviewers to focus on? -->

---

## 📝 Additional Notes

<!-- Any additional information that reviewers should know -->

---

<!--
Review Checklist for Maintainers:
- [ ] Code quality and style
- [ ] Tests are comprehensive
- [ ] Documentation is complete
- [ ] No security concerns
- [ ] Performance is acceptable
- [ ] Breaking changes are justified
- [ ] CI/CD passes
-->
