import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

void main() => runApp(const MaterialApp(title: 'Tide Timer', home: TideScreen()));

class TideScreen extends StatelessWidget {
  const TideScreen({super.key});

  Future<String> _load() async {
    final res = await http.get(Uri.parse('https://api.tidetimer.app/v1/today'));
    return res.body;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Tides')),
      body: FutureBuilder<String>(
        future: _load(),
        builder: (context, snap) => Center(child: Text(snap.data ?? 'Loading tides…')),
      ),
    );
  }
}
