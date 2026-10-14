import * as ImagePicker from "expo-image-picker";
import { Button, Text, View } from "react-native";

export default function Home() {
  const attach = () => ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"] });
  return (
    <View>
      <Text>My recipes</Text>
      <Button title="Attach photo" onPress={attach} />
    </View>
  );
}
