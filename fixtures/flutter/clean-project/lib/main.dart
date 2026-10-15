import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() => runApp(const HabitGardenApp());

class HabitGardenApp extends StatelessWidget {
  const HabitGardenApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Habit Garden',
      theme: ThemeData(colorSchemeSeed: Colors.green),
      home: const TodayScreen(),
    );
  }
}

class TodayScreen extends StatefulWidget {
  const TodayScreen({super.key});

  @override
  State<TodayScreen> createState() => _TodayScreenState();
}

class _TodayScreenState extends State<TodayScreen> {
  final _picker = ImagePicker();
  int _streak = 0;

  Future<void> _checkIn(ImageSource source) async {
    final photo = await _picker.pickImage(source: source, maxWidth: 1600);
    if (photo == null) return;
    final prefs = await SharedPreferences.getInstance();
    setState(() => _streak++);
    await prefs.setInt('streak', _streak);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Today')),
      body: Center(child: Text('Current streak: $_streak days')),
      floatingActionButton: Row(
        mainAxisAlignment: MainAxisAlignment.end,
        children: [
          FloatingActionButton(
            heroTag: 'camera',
            onPressed: () => _checkIn(ImageSource.camera),
            child: const Icon(Icons.photo_camera),
          ),
          const SizedBox(width: 12),
          FloatingActionButton(
            heroTag: 'gallery',
            onPressed: () => _checkIn(ImageSource.gallery),
            child: const Icon(Icons.photo_library),
          ),
        ],
      ),
    );
  }
}
