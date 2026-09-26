Conçois l'interface web d'une plateforme SaaS Enterprise AI Agent, moderne, premium et professionnelle.

L'objectif est de créer une expérience aussi fluide et intuitive que les interfaces modernes de ChatGPT, Gemini, Claude ou Cursor, tout en ayant une identité visuelle propre et adaptée à une plateforme B2B Enterprise.

1. Vision du produit

La plateforme permet aux entreprises de :

- créer des AI Agents ;
- configurer leurs agents en langage naturel ;
- connecter leurs propres modèles IA et providers ;
- connecter leurs propres données et systèmes RAG ;
- ajouter des tools, MCP servers et APIs ;
- composer plusieurs agents ;
- créer des workflows ;
- tester leurs agents dans une interface conversationnelle ;
- passer progressivement du no-code au pro-code.

La plateforme est provider-agnostic et infrastructure-agnostic.

Elle ne doit donc pas donner l'impression qu'elle appartient à OpenAI, Google ou Anthropic.

L'entreprise conserve le contrôle de :

- ses modèles ;
- ses credentials ;
- ses données ;
- son RAG ;
- ses outils ;
- ses infrastructures.

---

2. Direction artistique

Créer une interface :

- minimaliste ;
- élégante ;
- très moderne ;
- professionnelle ;
- orientée développeurs et équipes Enterprise ;
- beaucoup d'espace blanc ;
- excellente hiérarchie visuelle ;
- typographie moderne ;
- animations très discrètes ;
- interactions fluides ;
- responsive ;
- dark mode et light mode.

S'inspirer de la qualité UX de ChatGPT, Gemini, Linear, Vercel, Cursor et Notion, mais ne copier aucun design, logo ou élément propriétaire.

L'interface doit donner immédiatement l'impression d'un produit SaaS sérieux et mature.

Éviter :

- dashboards surchargés ;
- trop de couleurs ;
- gradients excessifs ;
- cartes partout ;
- effets "AI futuriste" clichés ;
- interfaces qui ressemblent à un prototype étudiant.

---

3. Layout principal

Utiliser une structure similaire aux applications modernes d'AI :

┌─────────────────────────────────────────────────────────────┐
│ Logo / Workspace Search Profile │
├──────────────┬──────────────────────────────────────────────┤
│ │ │
│ Workspace │ │
│ │ Main content │
│ Agents │ │
│ Workflows │ │
│ Knowledge │ │
│ Tools │ │
│ MCP │ │
│ Models │ │
│ │ │
│ │ │
│ Settings │ │
└──────────────┴──────────────────────────────────────────────┘

La sidebar doit être compacte et élégante.

Elle doit pouvoir être réduite pour maximiser l'espace de travail.

---

4. Dashboard

Créer un dashboard simple et utile.

Afficher par exemple :

Good morning, Carel

Puis :

- Agents
- Active workflows
- Knowledge bases
- Connected providers
- Recent activity

Afficher quelques agents récemment utilisés.

Exemple :

Your Agents

┌────────────────────────────────────┐
│ EDB Assistant │
│ Architecture │
│ ● Active │
│ │
│ Gemini / Vertex AI │
│ Updated 2 hours ago │
└────────────────────────────────────┘

Ne pas surcharger le dashboard avec des statistiques inutiles.

---

5. AI Agent Builder

C'est l'une des fonctionnalités principales.

Créer un builder moderne permettant de créer un agent.

Interface :

Create Agent

Name
[ EDB Assistant ]

Description
[ Assistant for creating and validating EDBs ]

Instructions

┌──────────────────────────────────────────┐
│ You are an enterprise architecture... │
│ │
└──────────────────────────────────────────┘

Model
[ Customer Vertex AI ▼ ]

Knowledge
[ Architecture Knowledge Base ▼ ]

Tools
[ + Add tool ]

MCP
[ + Connect MCP server ]

Capabilities
☑ Tool calling
☑ Structured output
☑ Streaming
☐ Vision

Ajouter un bouton :

Test agent

qui ouvre immédiatement une interface de chat.

---

6. Chat interface

Le chat doit être l'une des parties les plus soignées de l'application.

Créer une expérience similaire aux meilleurs assistants IA modernes :

                    EDB Assistant

        How can I help you today?

      ┌──────────────────────────────────┐
      │ Describe your business need... │
      │ │
      │ ↑ Send │
      └──────────────────────────────────┘

       + Attach Tools Model

Pendant la conversation :

- streaming des réponses ;
- markdown ;
- code blocks ;
- tableaux ;
- fichiers ;
- citations ;
- tool calls visibles mais élégants ;
- possibilité de régénérer une réponse ;
- copier ;
- feedback ;
- historique.

Les tool calls doivent être représentés comme des composants UI compacts :

▸ Searching Architecture Knowledge Base
12 documents found

et non comme des logs techniques illisibles.

---

7. Model Providers

Créer une page dédiée :

Models & Providers

Important : ne jamais imposer une liste fixe de modèles.

L'utilisateur doit pouvoir connecter son infrastructure.

Interface :

Models & Providers

Connected providers

┌─────────────────────────────────────────────┐
│ Google Vertex AI │
│ Connected │
│ 3 models available │
│ Configure │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ OpenAI-compatible │
│ Connected │
│ Customer endpoint │
│ Configure │
└─────────────────────────────────────────────┘

                         + Add provider

Lorsqu'on clique sur Add provider, proposer :

Add Model Provider

Provider type

[ Select provider / Custom provider ]

Endpoint
[ https://... ]

Authentication
[ API Key / OAuth / Service Account ]

Credentials
[ ******** ]

Model identifier
[ ... ]

[ Test connection ]

[ Save provider ]

Le design doit montrer clairement que le client apporte son propre provider et ses propres credentials.

---

8. Knowledge / RAG

Créer une section Knowledge.

Interface moderne permettant de :

- créer une knowledge base ;
- importer des fichiers ;
- connecter des sources ;
- configurer le retrieval ;
- voir les documents ;
- tester la recherche.

Exemple :

Knowledge

Architecture Knowledge Base

Sources
────────────────────────
Confluence
PDFs
Web
GitHub
Custom API

Documents
1,284

Retrieval
Hybrid Search

Embedding provider
Customer managed

[ Test retrieval ]

La plateforme doit également pouvoir fonctionner sans RAG.

---

9. Tools & MCP

Créer une section :

Tools & MCP

Afficher les outils sous forme de composants propres :

Tools

GitHub
● Connected

PostgreSQL
● Connected

Jira
● Connected

Custom API
● Connected

                         + Add tool

Pour MCP :

MCP Servers

GitHub MCP
● Connected

Internal Engineering MCP
● Connected

                         + Connect MCP

---

10. Agent composition

Créer une interface permettant de composer des agents.

Exemple visuel :

                 Customer Request
                         │
                         ▼
                 ┌───────────────┐
                 │ Orchestrator │
                 └───────┬───────┘
                         │
              ┌──────────┼──────────┐
              ▼ ▼ ▼
          Researcher Analyst Writer
              │ │ │
              └──────────┼──────────┘
                         ▼
                    Final Agent

L'interface doit ressembler davantage à un outil professionnel de workflow qu'à un simple diagramme.

Permettre de cliquer sur chaque agent pour modifier sa configuration.

---

11. No-code → Pro-code

C'est un élément essentiel du produit.

Chaque agent doit pouvoir évoluer :

No-code
↓
Configuration
↓
Advanced
↓
Code

Ajouter un bouton :

Open in Code

qui ouvre un environnement de développement permettant de modifier le comportement de l'agent.

L'interface doit clairement montrer que les développeurs peuvent reprendre le contrôle lorsqu'une configuration visuelle devient insuffisante.

---

12. Enterprise UX

Prévoir également :

- Organizations
- Workspaces
- Members
- Roles & permissions
- API keys
- Audit logs
- Usage
- Billing
- Security
- Environments
- Secrets

Mais garder ces fonctionnalités secondaires et ne pas polluer l'expérience principale.

---

13. Navigation

Navigation principale :

Workspace

Home
Agents
Workflows
Knowledge
Tools
MCP
Models

────────────────

Developer

API
Logs
Usage

────────────────

Settings

---

14. Design system

Créer un design system cohérent :

- boutons ;
- inputs ;
- dropdowns ;
- modals ;
- command palette ;
- tabs ;
- badges ;
- tooltips ;
- cards ;
- tables ;
- chat components ;
- code editor ;
- workflow nodes.

Ajouter une Command Palette accessible avec :

"⌘K / Ctrl+K"

permettant de rechercher rapidement :

Search anything...

Create agent
Open EDB Assistant
Connect provider
Create workflow
Search knowledge
Open settings

---

15. Responsive design

L'application doit fonctionner sur :

- desktop ;
- laptop ;
- tablette.

Le desktop doit être la priorité car le produit cible des utilisateurs Enterprise et développeurs.

---

16. Technologies UI

Utiliser si possible :

- React
- TypeScript
- Tailwind CSS
- composants accessibles
- animations légères
- architecture modulaire

Privilégier des composants réutilisables et un design system cohérent.

Ne pas créer une énorme page monolithique.

---

17. Important

Le résultat final doit donner l'impression d'un véritable produit SaaS Enterprise AI prêt à être utilisé par une entreprise, pas d'une simple démo de chatbot.

L'expérience principale doit être :

simple pour un utilisateur métier → puissante pour un développeur → configurable pour une équipe Enterprise.

Le principe produit à garder constamment en tête est :

«"The platform provides the experience. The enterprise keeps control of the infrastructure."»

Crée donc une interface qui matérialise visuellement ce principe.

Commence par concevoir les écrans principaux et leur système de navigation, puis implémente l'interface avec des données mockées réalistes afin que l'application soit immédiatement navigable et donne l'impression d'un produit fonctionnel.
