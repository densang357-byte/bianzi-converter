# 各標準字形

本目錄整理工具目前九種方案的字形與用字，列出 4140 個輸入字；其中 292 個字的獨立單字輸出因方案而異。

| 方案 | 綫／線 | 衞／衛 | 裡／裏 | 朶／朵 | 牀／床 | 羣／群 | 峯／峰 | 烟／煙 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 默認標準 | 電綫 | 衞生 | 裡面 | 花朵 | 牀鋪 | 羣衆 | 山峯 | 煙火 |
| OpenCC 通用繁體 | 電線 | 衛生 | 裏面 | 花朵 | 牀鋪 | 羣衆 | 山峯 | 煙火 |
| 臺灣 | 電線 | 衛生 | 裡面 | 花朵 | 床鋪 | 群眾 | 山峰 | 煙火 |
| 香港 | 電線 | 衞生 | 裏面 | 花朵 | 牀鋪 | 羣眾 | 山峯 | 煙火 |
| 香港舊標準（1960年代重建） | 電綫 | 衞生 | 裏面 | 花朵 | 牀鋪 | 羣衆 | 山峯 | 烟火 |
| 臺灣舊標準（1960年代重建） | 電線 | 衛生 | 裏面 | 花朶 | 牀鋪 | 群衆 | 山峰 | 煙火 |
| 古籍繁體 | 電線 | 衛生 | 裏面 | 花朶 | 牀鋪 | 群衆 | 山峰 | 煙火 |
| 調和繁體 | 電線 | 衛生 | 裏面 | 花朵 | 床鋪 | 群衆 | 山峰 | 煙火 |
| 學生字典（試用） | 電線 | 衞生 | 裏面 | 花朵 | 牀鋪 | 羣眾 | 山峯 | 煙火 |

古籍繁體爲大陸標準繁體；調和繁體爲大陸繁體微調。港臺舊標準爲字形重建方案；《學生字典》爲試用方案，待核字組見 [policy.json](../dictionaries/student-standard/policy.json)。

## 字表下載

| 方案 | JSON | TSV |
| --- | --- | --- |
| 默認標準 | [JSON](modern.json) | [TSV](modern.tsv) |
| OpenCC 通用繁體 | [JSON](opencc.json) | [TSV](opencc.tsv) |
| 臺灣 | [JSON](taiwan.json) | [TSV](taiwan.tsv) |
| 香港 | [JSON](hongkong.json) | [TSV](hongkong.tsv) |
| 香港舊標準（1960年代重建） | [JSON](hongkong-old.json) | [TSV](hongkong-old.tsv) |
| 臺灣舊標準（1960年代重建） | [JSON](taiwan-old.json) | [TSV](taiwan-old.tsv) |
| 古籍繁體 | [JSON](guji.json) | [TSV](guji.tsv) |
| 調和繁體 | [JSON](harmonized.json) | [TSV](harmonized.tsv) |
| 學生字典（試用） | [JSON](student.json) | [TSV](student.tsv) |

另有[常見用字對照](comparison.md)和[完整單字差異表](differences.tsv)。

JSON 的 `isolatedOutput` 爲該字單獨輸入時的輸出；`candidates` 爲字庫候選。多候選不表示任意互換，詞義分化須看實際詞界、詞性與局部語境。表內記錄 Unicode 字元；同碼位的字體筆形由所用字體呈現。

字表從目前程式及字庫產生，使用純詞庫模式、預設異體設定及保留「着」。示例均爲字詞，未引用私人作品。重新產生：

```sh
npm run export:standards
```

產生過程的診斷分類保存在本機 regression stage；不隨字表發布。第三方字表授權見 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)。
