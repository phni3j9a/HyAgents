# HyAgents

通常のPiをMainにして、4種類の専門Agentを必要に応じて使い分ける軽量パッケージです。OMPの委任・レビュー方針を参考にし、起動、並列実行、結果回収、セッション継続は **pi-subagents** に任せます。

## Agent構成

| Agent | PiのモデルID | Thinking | 担当 |
| --- | --- | --- | --- |
| Main | Piで選択中のモデル | 現在の設定 | 対話、計画、委任、統合、最終判断 |
| `hyagents.worker` | `openai-codex/gpt-6-luna` | `max` | 実装、修正、周辺調査、局所テスト |
| `hyagents.scout` | `openai-codex/gpt-6-luna` | `xhigh` | 対象ファイルが不明な読み取り探索 |
| `hyagents.reviewer` | `openai-codex/gpt-6.1-sol` | `high` | 変更によって導入された具体的な不具合の検出 |
| `hyagents.designer` | `anthropic/claude-opus-5-5` | `high` | UI/UX設計、画面・コンポーネント実装 |

Opus 5.5のPiネイティブIDは `claude-opus-5-5` です。OpenAI側は `openai-codex`、Designerは `anthropic` を使用します。別プロバイダーやClaude Codeへの暗黙の切り替えは行いません。

## インストール

検証対象: **Pi 1.1.0 / pi-subagents 0.76.1 / Node.js 22.19以上**。旧 `@mariozechner/*` 世代のPiは対象外です。

Piが未導入なら、先に導入します。

```sh
npm install -g @earendil-works/pi-coding-agent@1.1.0
```

次の2つをPiパッケージとして登録してください。

```sh
pi install npm:pi-subagents@0.76.1
pi install git:github.com/phni3j9a/HyAgents
```

起動中なら `/reload`、そうでなければ通常どおり `pi` を起動します。**毎回 `/hyagents` やSkillを呼び出す必要はありません。** 4つのAgentはパッケージのmanifestから発見され、Mainへ委任方針が自動適用されます。

`pi-subagents` はHyAgentsの依存パッケージにも含まれますが、これは公開の起動検証APIを読み込むためです。依存関係のインストールだけでは `subagent` ツールが有効にならないため、上記の `pi install npm:pi-subagents@0.76.1` も必要です。二重にExtensionを読み込ませる必要はありません。

各プロバイダーの認証はPiの通常の方法で設定してください。HyAgentsは認証情報やグローバル設定を書き換えません。

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

## モデルとThinkingの固定

Agent frontmatterのネイティブ `model` と `thinking` で初期値を指定します。`model` には `:max` などのsuffixも含め、低いThinking設定への意図しない変更を避けます。

それだけではper-run overrideや設定の優先順位で外れるため、MainのExtensionがpi-subagentsの公開 `required-child-extensions` APIへ小さな検証Extensionを登録します。**実際に解決された子のモデル・Thinkingを `session_start` で照合**し、違う場合は最初のモデルリクエスト前に起動を失敗させます。Piが未対応のThinkingを丸めた場合も通しません。Mainのモデル／Thinkingは変更しません。

この経路はローカルのネイティブ子セッションに適用されます。通常の `subagent`、ネイティブworkflow、`/run` からの子起動も同じruntimeの仕組みを使います。保持済み子の起動にはpi-subagentsの保持された検証Extension契約が使われます。HyAgentsがセッションファイルを管理することはありません。

v0.1は上表の組み合わせを固定仕様とします。`agentOverrides` に違うモデル・Thinkingを設定しても、HyAgentsの子は検証で停止します。別構成に変更する開発では、Agent frontmatterと `src/models.ts` の双方を変更して検証してください。既存の `subagents.modelScope` や `maxThinking` が起動を拒否した場合も、その制約を自動で緩めません。

`hyagents.*` を外部CLI／リモート実行用のAgentで上書きする運用は対象外です。任意の信頼済みExtensionや設定変更に対するセキュリティ境界ではありません。

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
| `extensions/hyagents.ts` | Mainへの自動適用、診断コマンド、検証Extensionの登録 |
| `extensions/verify-child.ts` | ネイティブ子セッション起動時のモデル検証 |
| `src/models.ts` | 固定モデル契約と照合 |

Mainへの適用にはPiの構造化prompt sectionを使い、他のExtensionの指示やprompt cacheを維持します。子AgentへMain用ポリシーを再注入しません。組み込みの `worker`、`scout`、`reviewer` は上書きしません。

pi-subagents 0.76.1のrequired-child-extension登録は、親セッションごとに1つです。他のホストExtensionが既に同じ登録を所有している場合、HyAgentsは競合を表示して自動委任を有効化しません。そのExtensionの登録を上書きしません。

セッション復帰の可否・保持期間・並列実行・Fleet UIはpi-subagents側の仕様と設定に従います。プロセス終了後の復帰をHyAgentsが独自に保証するものではありません。FleetView等のUIは別途利用でき、HyAgentsには同梱しません。

アンインストール:

```sh
pi remove git:github.com/phni3j9a/HyAgents
```

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
