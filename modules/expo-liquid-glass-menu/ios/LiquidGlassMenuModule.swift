import ExpoModulesCore

internal struct LiquidGlassMenuOption: Record {
  @Field var value: String = ""
  @Field var label: String = ""
}

public final class LiquidGlassMenuModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoLiquidGlassMenu")

    View(LiquidGlassMenuView.self) {
      Events("onOptionSelected")

      Prop("options") { (view, options: [LiquidGlassMenuOption]) in
        view.options = options.map { LiquidGlassMenuItem(value: $0.value, label: $0.label) }
      }

      Prop("selectedValue") { (view, selectedValue: String) in
        view.selectedValue = selectedValue
      }
    }
  }
}
