; ONNX 预编译库直接导入系统 DirectX 组件，缺失时应用入口之前就会失败。
!include LogicLib.nsh
!include x64.nsh

!macro NSIS_HOOK_PREINSTALL
    ${IfNot} ${RunningX64}
        MessageBox MB_OK|MB_ICONSTOP "梦幻养老助手仅支持 Windows x64。"
        SetErrorLevel 1
        Quit
    ${EndIf}

    ${DisableX64FSRedirection}
    IfFileExists "$SYSDIR\dxcore.dll" 0 mh_missing_directx
    IfFileExists "$SYSDIR\d3d12.dll" 0 mh_missing_directx
    IfFileExists "$SYSDIR\dxgi.dll" 0 mh_missing_directx
    ${EnableX64FSRedirection}
    Goto mh_runtime_ready

    mh_missing_directx:
        ${EnableX64FSRedirection}
        MessageBox MB_OK|MB_ICONSTOP "系统缺少必要的 DirectX 组件。请更新至 Windows 10 2004 或更高版本，或 Windows 11，并通过 Windows 更新修复系统组件后重试。"
        SetErrorLevel 1
        Quit

    mh_runtime_ready:
!macroend
