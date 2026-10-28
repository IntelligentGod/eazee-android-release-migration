import ExpoModulesCore
import UIKit

internal struct LiquidGlassMenuItem {
  let value: String
  let label: String
}

public final class LiquidGlassMenuView: ExpoView {
  let onOptionSelected = EventDispatcher()

  var options: [LiquidGlassMenuItem] = [] {
    didSet {
      updateButton()
    }
  }

  var selectedValue = "" {
    didSet {
      updateButton()
    }
  }

  private let button = UIButton(type: .system)

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)

    button.overrideUserInterfaceStyle = .light
    button.translatesAutoresizingMaskIntoConstraints = false
    button.showsMenuAsPrimaryAction = true
    button.changesSelectionAsPrimaryAction = false
    addSubview(button)

    NSLayoutConstraint.activate([
      button.topAnchor.constraint(equalTo: topAnchor),
      button.bottomAnchor.constraint(equalTo: bottomAnchor),
      button.leadingAnchor.constraint(equalTo: leadingAnchor),
      button.trailingAnchor.constraint(equalTo: trailingAnchor)
    ])

    updateButton()
  }

  private func updateButton() {
    guard #available(iOS 26.0, *) else {
      return
    }

    #if compiler(>=6.2)
    var configuration = UIButton.Configuration.glass()
    configuration.title = options.first(where: { $0.value == selectedValue })?.label ?? "Default"
    configuration.image = UIImage(systemName: "chevron.down")
    configuration.imagePlacement = .trailing
    configuration.imagePadding = 4
    configuration.baseForegroundColor = UIColor(
      red: 77 / 255,
      green: 74 / 255,
      blue: 59 / 255,
      alpha: 1
    )
    configuration.baseBackgroundColor = UIColor(
      red: 246 / 255,
      green: 242 / 255,
      blue: 227 / 255,
      alpha: 0.94
    )
    configuration.cornerStyle = .capsule
    configuration.preferredSymbolConfigurationForImage = UIImage.SymbolConfiguration(
      pointSize: 12,
      weight: .bold
    )
    configuration.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
      var outgoing = incoming
      outgoing.font = UIFont.systemFont(ofSize: 12, weight: .heavy)
      outgoing.foregroundColor = UIColor(
        red: 77 / 255,
        green: 74 / 255,
        blue: 59 / 255,
        alpha: 1
      )
      return outgoing
    }
    button.configuration = configuration

    let actions = options.map { option in
      UIAction(
        title: option.label,
        state: option.value == selectedValue ? .on : .off
      ) { [weak self] _ in
        guard let self else {
          return
        }
        self.selectedValue = option.value
        self.onOptionSelected(["value": option.value])
      }
    }

    button.menu = UIMenu(title: "", options: [.singleSelection], children: actions)
    #endif
  }
}
