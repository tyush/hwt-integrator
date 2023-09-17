# hwt-integrator README

A VSCode plugin that allows you to manage your magical libChallenge1Lib LLVM plugin from the comfort of your web-server based IDE!

# Building
Same as any other TypeScript VSCode extension.

Requires `vsce`.

``` sh
npm install -g @vscode/vsce
vsce package
```
will produce a .vsix package, installable by VSCode. Publish with
``` sh
vsce publish
```

# Resources Used
 - [Official VS Code API documentation](https://code.visualstudio.com/api)
 - The [TypeScript file](https://github.com/microsoft/vscode/blob/main/src/vscode-dts/vscode.d.ts) for VS Code structures
 - The [VS Code Extension Samples](https://github.com/microsoft/vscode-extension-samples.git) repo

