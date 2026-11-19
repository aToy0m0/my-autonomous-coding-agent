# Personal Autonomous Coding Agent

AWS上でコーディングタスクをバックグラウンド実行し、GitHubのPull Requestとして結果を受け取る個人向けエージェントです。
独自のWeb UIからタスクを投入し、進捗、追加指示、承認、実行結果を確認できます。

## 構成

- ReactとCloudscapeによるWeb UI。S3とCloudFrontで配信します。
- Cognito認証と送信元IP制限を適用したAPI Gateway REST API。
- Lambdaによるタスク制御と、PUBLICネットワーク方式のAgentCore Runtime。
- DynamoDBによるタスク状態、承認、予算の管理。
- コーディング用の既定モデルはSonnet 4.6。同梱Blueprintは1タスク1 USDのモデル利用予算を持ちます。

NAT Gateway、VPC Endpoint、WAF、CloudWatch Dashboard、運用アラーム、通知用SNSとKMSキーは既定構成で作成しません。
Slack、Linear、Jira、プレビューのスクリーンショット、Agent Registry、Tool Gatewayの連携も既定では無効です。
秘密情報、保存データ、ログ、定期処理などの費用は残ります。予算設定はAWS全体の請求上限ではありません。

設計とIP変更の手順は [設計書](docs/public-guide/design.md) を参照してください。

## セットアップ

Node.js 24、Yarn Classic、Python 3.13以上、uvを使用します。
AWSへのデプロイにはAWS CLI、CDKの権限とDockerも必要です。WindowsでDockerを使用する場合はWSL内で実行してください。

```powershell
yarn install --frozen-lockfile
Copy-Item cdk/cdk.example.json cdk/cdk.json
Copy-Item abca.deployment.example.json abca.deployment.json
```

既存設定がある場合は上書きせず、exampleとの差分を取り込んでください。
`cdk/cdk.json` の `context.allowedSourceIps.home` と `mobile` に、実際のグローバルIPを設定します。
IPv4は `/32`、IPv6は `/128` の個別アドレスだけ受け付けます。未設定のままではデプロイ用の合成を停止します。
対象リポジトリは同じcontextの `blueprintRepo` に `owner/repository` 形式で設定します。
既定Stack名は `my-backgroundagent-dev` です。

`cdk/cdk.json`、`abca.deployment.json`、`.env`、秘密情報、内部の作業資料はGit管理対象外です。
exampleには実IP、個人メール、資格情報を含めていません。

## ローカル確認

```powershell
npm run --workspace @abca/web dev:mock
```

`http://127.0.0.1:5173` でモック画面を確認できます。AWSへタスクは送信しません。

```powershell
npm run check:low-cost
```

Webの型チェックと本番ビルド、CDKの型チェック、個人向け構成の合成テストを実行します。
合成テストは文書用IPを注入するため、実際の許可IPやAWS認証は不要です。
継承した上流の全機能組み合わせテストとは別の受入試験です。

## AWSへ反映する前に

1. リージョン、デプロイ用プロファイル、GitHub Secret、モデルの利用条件を確認します。
2. Webをビルドし、CDK diffで対象Stackと変更内容を確認します。
3. CDK操作には明示的に `--profile cdkdep` を指定します。
4. デプロイ後、Cognitoに管理者操作で自分のユーザーだけを作成します。自己登録は無効です。
5. `ConsoleUrl` OutputからUIを開き、許可IP、認証、タスクの予算を確認します。

サーバー側の機能にはBedrockのアカウント内リージョン単位のモデル呼び出しログ設定が含まれます。
既存のAWS環境へ反映する前に、その設定の共有範囲を確認してください。
本番利用の前に、Dockerイメージ作成、実AWS環境の認証とタスク実行を検証してください。

このプロジェクトは [ABCA](https://github.com/aws-samples/sample-autonomous-cloud-coding-agents) を基にした派生実装です。
ライセンスは [MIT-0](LICENSE) です。
