import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import Geolocation from "react-native-geolocation-service";

export default function App() {
  const [spot, setSpot] = useState<string>("Finding your car…");
  useEffect(() => {
    Geolocation.getCurrentPosition((p) => setSpot(`${p.coords.latitude}, ${p.coords.longitude}`));
  }, []);
  return (
    <View>
      <Text>Your car is parked at {spot}</Text>
    </View>
  );
}
