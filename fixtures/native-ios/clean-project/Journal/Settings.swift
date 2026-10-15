import Foundation

struct Settings {
    static var reminderHour: Int {
        get { UserDefaults.standard.integer(forKey: "reminderHour") }
        set { UserDefaults.standard.set(newValue, forKey: "reminderHour") }
    }
}
