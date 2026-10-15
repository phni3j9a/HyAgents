# Hybrid Subagents

役割ごとに異なるモデル・プロバイダーを組み合わせて使う専門Agent集です。このリポジトリは将来のherdr等への展開も見据えて `hybrid-subagents` とし、現在提供するPi向けパッケージは **`pi-hybrid-subagents`** です。herdr向けの実装はまだ含みません。

Pi版は、通常のPiをMainにして、4種類の専門Agentを必要に応じて使い分ける軽量パッケージです。OMPの委任・レビュー方針を参考にし、起動、並列実行、結果回収、セッション継続は **pi-subagents** に任せます。

旧称はHyAgentsです。既存設定・保持セッションとの互換性のため、コマンド `/hyagents`、Agent名 `hyagents.*`、Skill名 `hyagents`、設定ファイル `hyagents.json` と内部の保存キーは維持します。改名に伴う設定の移行は不要です。

## Agent構成

以下は**初期値**です。4役割のモデル・Thinking・Fastモードは `/hyagents models` で変更できます。Workerの `max` も変更可能です。Fastモードの初期値は全役割でoffです。

| Agent | PiのモデルID | Thinking | 担当 |
| --- | --- | --- | --- |
| Main | Piで選択中のモデル | 現在の設定 | 対話、計画、委任、統合、最終判断 |
| `hyagents.worker` | `openai-codex/gpt-6-luna` | `max` | 実装、修正、周辺調査、局所テスト |
| `hyagents.scout` | `openai-codex/gpt-6-luna` | `xhigh` | 対象ファイルが不明な読み取り探索 |
| `hyagents.reviewer` | `openai-codex/gpt-6.1-sol` | `high` | 変更によって導入された具体的な不具合の検出 |
| `hyagents.designer` | `anthropic/claude-opus-5-5` | `high` | UI/UX設計、画面・コンポーネント実装 |

Opus 5.5のPiネイティブIDは `claude-opus-5-5` です。初期設定ではOpenAI側は `openai-codex`、Designerは `anthropic` を使用します。ユーザーが別のPiプロバイダー／モデルを選択できます。暗黙の切り替えは行いません。

## インストール

検証対象: **Pi 1.1.0 / pi-subagents 0.76.1 / Node.js 22.19以上**。旧 `@mariozechner/*` 世代のPiは対象外です。

Piが未導入なら、先に導入します。

```sh
npm install -g @earendil-works/pi-coding-agent@1.1.0
```

次の2つをPiパッケージとして登録してください。

```sh
pi install npm:pi-subagents@0.76.1
pi install npm:pi-hybrid-subagents
```

未公開の最新版を試す場合は、`npm:pi-hybrid-subagents` の代わりに `git:github.com/phni3j9a/hybrid-subagents` を指定します。Pi 1.2では、Hybrid Subagentsだけを更新する場合は `pi update npm:pi-hybrid-subagents`、全パッケージを更新する場合は `pi update --extensions` を使います（`pi update` 単独はPi本体の更新です）。

旧リポジトリ名で導入したGitHub版からnpm版へ切り替える場合は、二重に読み込まれないよう、先に元のソース指定で登録を外してください。モデル・Thinking・Fastの保存済み設定はそのまま使えます。

```sh
pi remove git:github.com/phni3j9a/HyAgents
pi install npm:pi-hybrid-subagents
```

起動中なら `/reload`、そうでなければ通常どおり `pi` を起動します。**毎回 `/hyagents` やSkillを呼び出す必要はありません。** 4つのAgentはパッケージのmanifestから発見され、Mainへ委任方針が自動適用されます。

`pi-subagents` はHybrid Subagentsの依存パッケージにも含まれますが、これは公開の起動検証APIを読み込むためです。依存関係のインストールだけでは `subagent` ツールが有効にならないため、上記の `pi install npm:pi-subagents@0.76.1` も必要です。二重にExtensionを読み込ませる必要はありません。

各プロバイダーの認証はPiの通常の方法で設定してください。Hybrid Subagentsは認証情報を管理しません。モデル設定はユーザーが保存操作を行った場合にだけ更新します。

確認用コマンド:

```text
/hyagents
/subagents-models hyagents.worker
```

`/hyagents` は登録モデルと認証設定の準備状況を表示します。APIへの試験リクエストは送らないため、利用権限、期限切れの認証、利用枠の最終確認は実際の子Agent起動時に行われます。モデルが見つからなければPiやモデルカタログを更新してください。

プロジェクト限定で使用する場合は、両方の `pi install` に `--local` を付け、Piの通常のプロジェクト信頼設定に従ってください。

## 普段の使い方

普通に作業を依頼します。

```text
この不具合の原因を調べて修正してください。
この画面をスマホで使いやすくしてください。
この変更をレビューしてください。
```

Mainは小さな作業を直接処理できます。ファイルが不明な読み取り探索はScout、調査から編集まで一続きの仕事はWorker、UI/UXはDesignerへ委任します。Reviewerの起動と再レビューはMainの完全裁量です。

- 並列作業ではファイルの担当と共有インターフェースを先に決めます。
- Worker／Designerは担当範囲の小さなテストを実行できます。
- 全体Build・Lint・Formatter・結合テストは、並列編集の統合後にMainが調整します。
- Reviewerは証拠のある新規不具合だけを報告し、原則として編集しません。
- Planner専用Agent、必須レビュー、合格までの反復、指摘台帳、独自Checkpointはありません。

Scout／Reviewerの非編集方針はプロンプトによる役割定義です。4つのAgentには独自のツール許可リスト・禁止リストを設定しておらず、Pi／OS／既存Extensionの権限設定はそのまま適用されます。

## モデルとThinkingの選択

```text
/hyagents models
/hyagents models worker
/hyagents models scout
/hyagents models reviewer
/hyagents models designer
/hyagents models reset
```

引数なしの `models` は4役割の現在の設定を表示します（Fast有効時は末尾に `fast`）。役割を選んだ後、**プロバイダー → モデル → Thinking → Fast（OpenAI系のみ） → 保存先**の順に選択します。`models worker` などではその役割の設定を直接開きます。途中でEscなどでキャンセルすると保存しません。

- モデル候補はPiで認証設定済みのプロバイダーの登録モデルです。実際の利用権限・利用枠は起動時に確認されます。
- Thinkingには、そのモデルが対応する値だけを表示します。推論非対応モデルは `off` です。
- `User — all projects` はユーザー共通設定、`Project — this project only` はプロジェクト設定へ保存します。未信頼プロジェクトでは後者を表示しません。
- プロジェクト設定が優先されます。ユーザー共通設定を変更してもプロジェクト設定が優先される場合は、その旨と実効値を表示します。
- 保存後、**新しく起動する子Agentから反映**されます。設定変更のたびに `/reload` を実行する必要はありません。ほかのPiプロセスの表示は再読込まで古い場合があります。
- 実行中の子Agentは変更しません。v0.2以降に起動して会話が保存された保持セッションは、再開時も起動時の設定を使います。新設定を使うには新しい子Agentを開始してください。
- `reset` は保存先を選んで確認した後、4役割のモデル・Thinkingを上表の初期値に戻し、Fastをoffにします。他の設定は維持します。

### Fastモード

OpenAI系プロバイダー（`openai`、`openai-codex`）のモデルを選ぶと、Fastモードのon/offを選べます。onの子Agentは、プロバイダーへのリクエストに `service_tier: "priority"` を付けます。処理は速くなる一方、利用枠・費用の消費が増えます（Piの料金計算では通常の約2倍、gpt-5.5は2.5倍）。Sign in with ChatGPT利用時に優先処理がどの程度効くかはOpenAI側の扱いに依存します。

- Anthropicなど他のプロバイダーでは選択肢を表示せず、offとして保存します。手動設定で非対応プロバイダーにFastを有効にした場合、子Agentは起動時に停止します。
- pi-subagentsネイティブの `fast: true` は `openai-codex/*` 専用で、Pi 1.2以降のSign in with ChatGPT（`openai` プロバイダー）では使えないため、Hybrid Subagentsは独自に適用します。ネイティブの `fast` は変更しません。
- 保持セッションは、モデルと同様に起動時のFast選択を維持します。Fast対応前に作成した保持セッションはoffとして扱います。

モデル・Thinkingの保存先はpi-subagents標準の `subagents.agentOverrides` です。Fastは同じディレクトリの `hyagents.json`（ユーザー: `~/.pi/agent/hyagents.json`、プロジェクト: `.pi/hyagents.json`）に `{ "fast": { "hyagents.worker": true } }` の形で保存し、プロジェクト設定が優先されます（未信頼プロジェクトでは無視）。pi-subagentsの設定エディターは未知のoverride項目を書き込まないため、別ファイルにしています。ユーザー設定は通常 `~/.pi/agent/settings.json`、プロジェクト設定はpi-subagentsが解決するプロジェクトの `.pi/settings.json` です。設定ルートがない場合、プロジェクト保存時に現在のディレクトリへ `.pi` を作成します。パッケージ内のAgent定義を直接編集する必要はありません。

例（Workerだけを変更）:

```json
{
  "subagents": {
    "agentOverrides": {
      "hyagents.worker": {
        "model": "openai-codex/gpt-6.1-sol:high",
        "thinking": "high"
      }
    }
  }
}
```

通常はコマンドから両項目をまとめて設定してください。手動設定でも `model` のThinking suffixと `thinking` を一致させます。ヘッドレス実行ではこの設定ファイルを利用してください。選択メニューはTUIと選択ダイアログ対応のRPCクライアントで利用できます。

### 選択の検証

MainのExtensionはpi-subagentsの公開 `required-child-extensions` APIへ検証Extensionを登録します。新しい子の設定は公開preflight APIで取得し、**実際のモデル・Thinkingを最初のモデルリクエスト前に照合**します。Fastモードの適用も同じ検証Extensionが行います。per-run overrideやPiによる未対応Thinkingの丸めで設定から外れた場合は停止します。Mainのモデル／Thinkingは変更しません。

通常の `subagent`、ネイティブworkflow、`/run` が対象です。保持セッション用の選択はPi標準のcustom entryに記録し、独自のセッションファイルやCheckpointは作りません。v0.1で作成した保持セッションには記録がないため、初回再開時に現在の設定と照合します。不一致なら新しい子Agentを開始してください。

既存の `subagents.modelScope` や `maxThinking` は維持します。起動が拒否されても制約を自動で緩めません。Hybrid Subagentsではプロバイダーを含む明示的な役割設定を使い、Main依存の `model: inherit` や競合する `agentOverridesByProvider` は対象外です。後者は `/hyagents` で診断します。`hyagents.*` を外部CLI／リモート実行用Agentで上書きする運用も対象外です。この照合は任意の信頼済みExtensionに対するセキュリティ境界ではありません。

## Reviewerの出力

`agents/reviewer.md` の `outputSchema` をpi-subagentsへ渡し、ネイティブ `structured_output` で検証します。

```json
{
  "overall_correctness": "correct",
  "explanation": "修正が必要な新規不具合は見つかりませんでした。",
  "confidence": 0.9,
  "findings": []
}
```

指摘には `title`、`body`（問題・発生条件・影響）、P0〜P3に対応する `priority`（0〜3）、`confidence`、`file_path`、`line_start`、`line_end` が入ります。行範囲の差分との対応など意味的な条件はReviewerの指示に含めています。スキーマだけでコード上の主張の正しさまで証明するものではありません。

## 構成と互換性

| 場所 | 内容 |
| --- | --- |
| `agents/` | 名前空間付きの4つのネイティブAgent定義 |
| `skills/hyagents/SKILL.md` | 短い委任方針。Extensionもこの本文を読み、重複した方針を持たない |
| `extensions/hyagents.ts` | Mainへの自動適用、コマンド登録、検証Extensionの登録 |
| `extensions/verify-child.ts` | ネイティブ子セッション起動時のモデル検証とFastモードの適用 |
| `src/models.ts` | 推奨初期値、モデル表現と照合 |
| `src/model-command.ts` | 役割別のモデル・Thinking選択メニュー |
| `src/native-settings.ts` | ネイティブ設定の読み取りと保存 |
| `src/fast-settings.ts` | Fastモード設定（`hyagents.json`）の読み取りと保存 |

Mainへの適用にはPiの構造化prompt sectionを使い、他のExtensionの指示やprompt cacheを維持します。子AgentへMain用ポリシーを再注入しません。組み込みの `worker`、`scout`、`reviewer` は上書きしません。

pi-subagents 0.76.1のrequired-child-extension登録は、親セッションごとに1つです。他のホストExtensionが既に同じ登録を所有している場合、Hybrid Subagentsは競合を表示して自動委任を有効化しません。そのExtensionの登録を上書きしません。

設定の保存では、固定依存のpi-subagents 0.76.1が使う内部設定エディターを1つのadapterから呼び出します。ファイルロック・原子的保存・他フィールドの維持・プロジェクトルート解決を共有するためです。依存バージョンを更新するときはこのadapterの互換性も確認してください。

セッション復帰の可否・保持期間・並列実行・Fleet UIはpi-subagents側の仕様と設定に従います。プロセス終了後の復帰をHybrid Subagentsが独自に保証するものではありません。FleetView等のUIは別途利用でき、Hybrid Subagentsには同梱しません。

アンインストール:

```sh
pi remove npm:pi-hybrid-subagents
```

GitHubから導入した場合は `pi remove git:github.com/phni3j9a/hybrid-subagents` です。旧名で登録した場合は `pi remove git:github.com/phni3j9a/HyAgents` を使ってください。GitHubの旧URLは新URLへリダイレクトされますが、Piの登録ソース文字列は自動で変わりません。

その後 `/reload` またはPiを再起動します。pi-subagentsは他の用途に引き続き使えます。

## 開発・検証

```sh
npm ci
npm run check
npm pack --dry-run
```

テストは一時ディレクトリを使い、実際のPi／pi-subagentsのAgent発見、起動前の契約解決、子セッション起動、モデル／Thinking不一致の拒否、保持セッションの再オープン、ReviewerのJSON Schemaを確認します。通常のテストは外部モデルへリクエストを送らず、ユーザーの認証・Pi設定を変更しません。

実モデルの応答品質、費用、プロバイダーの認証成功、実作業を伴う並列実行／Resumeは、認証済み環境で別途確認してください。

参考: [Pi](https://github.com/earendil-works/pi)、[pi-subagents](https://github.com/nicobailon/pi-subagents)、[Oh My Pi](https://github.com/can1357/oh-my-pi)。由来とライセンスは [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) を参照してください。
