import UIKit

/// The logo on the site's green, matching the launch screen, held until the page first paints.
final class LaunchCover: UIView {
    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .wayanadBackground
        let logo = UIImageView(image: UIImage(named: "LaunchLogo"))
        logo.translatesAutoresizingMaskIntoConstraints = false
        addSubview(logo)
        NSLayoutConstraint.activate([logo.centerXAnchor.constraint(equalTo: centerXAnchor), logo.centerYAnchor.constraint(equalTo: centerYAnchor)])
    }
    required init?(coder: NSCoder) { fatalError() }
}

/// No connection: the game loads the road from the internet, so say so plainly and offer to try again.
final class OfflineView: UIView {
    var onRetry: (() -> Void)?

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .wayanadBackground

        let logo = UIImageView(image: UIImage(named: "LaunchLogo"))
        logo.contentMode = .scaleAspectFit
        logo.heightAnchor.constraint(equalToConstant: 72).isActive = true

        let title = UILabel()
        title.text = "No connection"
        title.font = UIFont(name: "Georgia", size: 30) ?? .systemFont(ofSize: 30, weight: .light)
        title.textColor = .wayanadInk

        let body = UILabel()
        body.text = "Drive Wayanad loads the road from the internet. Check your connection and try again."
        body.font = .systemFont(ofSize: 16)
        body.textColor = .wayanadMute
        body.numberOfLines = 0
        body.textAlignment = .center

        var config = UIButton.Configuration.filled()
        config.title = "Try again"
        config.baseBackgroundColor = .wayanadAmber
        config.baseForegroundColor = .wayanadBackground
        config.cornerStyle = .capsule
        config.contentInsets = NSDirectionalEdgeInsets(top: 14, leading: 28, bottom: 14, trailing: 28)
        let retry = UIButton(configuration: config, primaryAction: UIAction { [weak self] _ in self?.onRetry?() })

        let stack = UIStackView(arrangedSubviews: [logo, title, body, retry])
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 16
        stack.setCustomSpacing(28, after: body)
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: centerYAnchor),
            stack.widthAnchor.constraint(lessThanOrEqualToConstant: 340),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: leadingAnchor, constant: 24),
        ])
    }
    required init?(coder: NSCoder) { fatalError() }
}
